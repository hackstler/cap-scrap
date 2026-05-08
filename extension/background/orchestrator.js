// background/orchestrator.js
// Responsibility: Main run loop that processes pending rows one by one.
// Uses chrome.alarms for scheduling (survives service worker restarts).
// All state persisted in chrome.storage.local for crash recovery.
// Delegates token management to TokenManager, error classification to ErrorCodes.

const Orchestrator = (() => {
  "use strict";

  // ─── Constants ───

  const IDEALISTA_VALUATOR_BASE_URL = "https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=";
  const VALUATION_TIMEOUT_MS = 45000;
  const DEFAULT_DELAY_MINUTES = 3;
  const ALARM_NAME = "cap-next-row";
  const BAN_ALARM_NAME = "cap-resume-after-ban";
  const BAN_PAUSE_MINUTES = 30;
  const BAN_CONSECUTIVE_THRESHOLD = 3;
  const STATE_KEY = "runState";

  let workerWindowId = null;

  // ─── Helpers ───

  const broadcastToPopup = (message) => {
    chrome.runtime.sendMessage(message).catch(() => {});
  };

  const formatRowLabel = (index, total) => `[${index + 1}/${total}]`;

  const classifyError = (errorMessage) => {
    if (!errorMessage) return null;
    if (errorMessage.indexOf(ErrorCodes.IP_BAN) === 0) return ErrorCodes.IP_BAN;
    if (errorMessage.indexOf(ErrorCodes.DOM_TIMEOUT) === 0) return ErrorCodes.DOM_TIMEOUT;
    if (errorMessage.indexOf(ErrorCodes.API_ERROR) === 0) return ErrorCodes.API_ERROR;
    if (errorMessage.indexOf("401") !== -1) return ErrorCodes.TOKEN_EXPIRED;
    return null;
  };

  // ─── Persistent State ───

  const loadState = async () => {
    const data = await chrome.storage.local.get(STATE_KEY);
    return data[STATE_KEY] || null;
  };

  const saveState = async (state) => {
    await chrome.storage.local.set({ [STATE_KEY]: state });
  };

  const clearState = async () => {
    await chrome.storage.local.remove(STATE_KEY);
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.clear(BAN_ALARM_NAME);
  };

  const isStillRunning = async () => {
    const state = await loadState();
    return state && state.running;
  };

  // ─── Public: Status & Stop ───

  const getStatus = async () => {
    const state = await loadState();
    if (!state || !state.running) {
      return { running: false, pausedForBan: false, current: 0, total: 0 };
    }
    const currentRow = state.rows?.[state.currentIndex];
    return {
      running: true,
      pausedForBan: !!state.pausedForBan,
      banPauseResumeTime: state.banPauseResumeTime || null,
      current: state.currentIndex + 1,
      total: state.totalRows,
      ref: currentRow?.refCatastral || "",
    };
  };

  const stop = async () => {
    const state = await loadState();
    if (state) {
      state.running = false;
      state.pausedForBan = false;
      state.banPauseResumeTime = null;
      state.consecutiveDomTimeouts = 0;
      await saveState(state);
    }
    await chrome.alarms.clear(ALARM_NAME);
    await chrome.alarms.clear(BAN_ALARM_NAME);
    await closeWorkerWindow();
  };

  // ─── Auth Failure ───

  const stopRunAuthExpired = async (state) => {
    Logger.error("Sesion expirada. Deteniendo proceso.");
    broadcastToPopup({ action: "error", message: "Sesion expirada. Haz click en Empezar para re-autenticarte." });
    state.running = false;
    await saveState(state);
    await closeWorkerWindow();
    await chrome.alarms.clear(ALARM_NAME);
  };

  // ─── Ban Pause / Resume ───

  const enterBanPause = async (state) => {
    Logger.warn(`IP ban detectado. Pausando ${BAN_PAUSE_MINUTES} minutos.`);
    state.pausedForBan = true;
    state.banPauseResumeTime = new Date(Date.now() + BAN_PAUSE_MINUTES * 60 * 1000).toISOString();
    await saveState(state);
    await closeWorkerWindow();
    chrome.alarms.create(BAN_ALARM_NAME, { delayInMinutes: BAN_PAUSE_MINUTES });
    broadcastToPopup({
      action: "banPause",
      resumeTime: state.banPauseResumeTime,
      current: state.currentIndex + 1,
      total: state.totalRows,
    });
  };

  const resumeAfterBan = async () => {
    const state = await loadState();
    if (!state || !state.running || !state.pausedForBan) {
      Logger.info("Resume after ban: no hay estado activo o ya no esta pausado.");
      return;
    }
    Logger.info("Reanudando tras pausa por baneo IP...");
    state.pausedForBan = false;
    state.banPauseResumeTime = null;
    state.consecutiveDomTimeouts = 0;
    try {
      state.token = await TokenManager.refreshAccessToken();
      Logger.info("Token renovado OK tras pausa de baneo.");
    } catch (tokenErr) {
      Logger.error(`Token refresh fallo tras pausa de baneo: ${tokenErr.message}`);
      await stopRunAuthExpired(state);
      return;
    }
    await saveState(state);
    broadcastToPopup({
      action: "banResumed",
      current: state.currentIndex + 1,
      total: state.totalRows,
    });
    await processNextRow();
  };

  // ─── Worker Window ───

  const ensureWorkerWindow = async () => {
    if (workerWindowId !== null) {
      try {
        await chrome.windows.get(workerWindowId);
        return workerWindowId;
      } catch (e) {
        workerWindowId = null;
      }
    }

    const data = await chrome.storage.local.get("workerWindowId");
    if (data.workerWindowId) {
      try {
        await chrome.windows.get(data.workerWindowId);
        workerWindowId = data.workerWindowId;
        return workerWindowId;
      } catch (e) {
        // Window no longer exists
      }
    }

    return new Promise((resolve) => {
      chrome.windows.create({
        url: "about:blank",
        type: "normal",
        width: 800,
        height: 600,
        left: 50,
        top: 50,
        focused: false,
      }, (win) => {
        workerWindowId = win.id;
        chrome.storage.local.set({ workerWindowId: win.id });
        Logger.info(`Ventana de trabajo creada (ID: ${workerWindowId})`);
        resolve(workerWindowId);
      });
    });
  };

  const closeWorkerWindow = async () => {
    let wid = workerWindowId;
    workerWindowId = null;

    if (!wid) {
      const data = await chrome.storage.local.get("workerWindowId");
      wid = data.workerWindowId;
    }

    if (wid) {
      chrome.windows.remove(wid).catch(() => {});
    }
    await chrome.storage.local.remove("workerWindowId");
  };

  // ─── Screenshot ───

  const captureTabScreenshot = (windowId) =>
    new Promise((resolve) => {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          Logger.warn(`Screenshot: ${chrome.runtime.lastError.message}`);
          resolve(null);
        } else {
          resolve(dataUrl || null);
        }
      });
    });

  const uploadScreenshotSafely = async (token, refCatastral, screenshotDataUrl, rowLabel) => {
    if (!screenshotDataUrl) return "";
    try {
      const url = await DriveApi.uploadScreenshot(token, refCatastral, screenshotDataUrl);
      Logger.info(`${rowLabel} Screenshot subido a Drive`);
      return url;
    } catch (err) {
      Logger.warn(`${rowLabel} Error subiendo screenshot: ${err.message}`);
      return "";
    }
  };

  // ─── Process Single Property ───

  const waitForValuationResult = (tabId) =>
    new Promise((resolve, reject) => {
      let timeoutHandle = null;

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        chrome.runtime.onMessage.removeListener(listener);
      };

      const listener = (msg, sender) => {
        if (sender.tab?.id !== tabId || msg.action !== "valuationResult") return;
        cleanup();
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.data);
        }
      };

      chrome.runtime.onMessage.addListener(listener);

      timeoutHandle = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout (${VALUATION_TIMEOUT_MS / 1000}s)`));
      }, VALUATION_TIMEOUT_MS);
    });

  const processProperty = async (refCatastral, email) => {
    const winId = await ensureWorkerWindow();
    const url = `${IDEALISTA_VALUATOR_BASE_URL}${refCatastral}`;

    await chrome.storage.local.set({ currentEmail: email });

    const tab = await chrome.tabs.create({ url, windowId: winId, active: true });
    const tabId = tab.id;

    // Remove stale tabs so captureVisibleTab targets the right one
    const allTabs = await chrome.tabs.query({ windowId: winId });
    for (const t of allTabs) {
      if (t.id !== tabId) {
        chrome.tabs.remove(t.id).catch(() => {});
      }
    }

    try {
      const result = await waitForValuationResult(tabId);
      const screenshot = await captureTabScreenshot(winId);
      if (screenshot) {
        result.screenshot = screenshot;
        Logger.info("Screenshot capturado OK");
      }
      return result;
    } catch (err) {
      err.screenshot = await captureTabScreenshot(winId);
      throw err;
    } finally {
      chrome.tabs.remove(tabId).catch(() => {});
    }
  };

  // ─── Start Run ───

  const run = async (sheetId, email, authCode) => {
    await clearState();

    let token;
    if (authCode) {
      Logger.info("Intercambiando codigo de autorizacion...");
      try {
        token = await TokenManager.exchangeCodeForTokens(authCode);
      } catch (err) {
        broadcastToPopup({ action: "error", message: `Error de autenticacion: ${err.message}` });
        return;
      }
    } else {
      Logger.info("Renovando token con refresh token...");
      try {
        token = await TokenManager.refreshAccessToken();
      } catch (err) {
        broadcastToPopup({ action: "error", message: "Sesion expirada. Haz click en Empezar." });
        return;
      }
    }

    Logger.info("Leyendo filas del Sheet...");
    let rows;
    try {
      rows = await SheetsApi.readPendingRows(sheetId, token);
    } catch (err) {
      broadcastToPopup({ action: "error", message: `Error leyendo sheet: ${err.message}` });
      return;
    }

    if (rows.length === 0) {
      broadcastToPopup({ action: "error", message: "No hay filas pendientes (columna de control sin TRUE)" });
      return;
    }

    Logger.info(`${rows.length} filas pendientes encontradas`);

    Logger.info("Preparando carpeta de screenshots en Drive...");
    try {
      const folderId = await DriveApi.ensureFolder(token);
      Logger.info(`Carpeta Drive lista: ${folderId}`);
    } catch (err) {
      broadcastToPopup({ action: "error", message: `Error preparando Drive: ${err.message}` });
      return;
    }

    const state = {
      running: true,
      sheetId,
      email,
      token,
      rows,
      currentIndex: 0,
      successCount: 0,
      errorCount: 0,
      consecutiveDomTimeouts: 0,
      totalRows: rows.length,
    };
    await saveState(state);

    broadcastToPopup({ action: "progress", current: 0, total: state.totalRows, ref: "Iniciando..." });
    await processNextRow();
  };

  // ─── Process Next Row ───

  const processNextRow = async () => {
    let state;
    try {
      state = await loadState();
    } catch (err) {
      Logger.error(`Error cargando estado: ${err.message}`);
      return;
    }

    if (!state || !state.running) {
      await closeWorkerWindow();
      return;
    }

    if (state.currentIndex >= state.totalRows) {
      await finishRun(state);
      return;
    }

    const row = state.rows[state.currentIndex];
    const rowLabel = formatRowLabel(state.currentIndex, state.totalRows);

    broadcastToPopup({
      action: "progress",
      current: state.currentIndex + 1,
      total: state.totalRows,
      ref: row.refCatastral || "sin ref.",
    });

    let token;
    try {
      token = await TokenManager.ensureValidToken(state);
    } catch (tokenErr) {
      await stopRunAuthExpired(state);
      return;
    }

    try {
      if (!row.refCatastral) {
        Logger.warn(`Fila ${row.rowIndex}: Sin referencia catastral`);
        await SheetsApi.writeValuationResult(state.sheetId, token, row.rowIndex, { error: "Sin referencia catastral" });
        state.errorCount++;
      } else {
        Logger.info(`${rowLabel} Procesando fila ${row.rowIndex}: ${row.refCatastral}`);

        const result = await processProperty(row.refCatastral, state.email);
        Logger.info(`${rowLabel} OK: Max ${result.maxVenta} | Min ${result.minVenta}`);

        const screenshotUrl = await uploadScreenshotSafely(token, row.refCatastral, result.screenshot, rowLabel);

        await SheetsApi.writeValuationResult(state.sheetId, token, row.rowIndex, {
          maxVenta: result.maxVenta,
          minVenta: result.minVenta,
          screenshotUrl,
        });
        state.consecutiveDomTimeouts = 0;
        state.successCount++;
      }
    } catch (err) {
      Logger.error(`${rowLabel} FALLO fila ${row.rowIndex}: ${err.message}`);
      const handled = await handleProcessingError(err, state, token, row, rowLabel);
      if (handled) return;
    }

    if (!(await isStillRunning())) {
      await closeWorkerWindow();
      return;
    }

    state.currentIndex++;
    await saveState(state);

    if (state.currentIndex >= state.totalRows) {
      await finishRun(state);
    } else {
      await scheduleNextRow(state);
    }
  };

  // ─── Error Handling ───

  const handleProcessingError = async (err, state, token, row, rowLabel) => {
    const errorType = classifyError(err.message);

    if (errorType === ErrorCodes.TOKEN_EXPIRED) {
      await stopRunAuthExpired(state);
      return true;
    }

    if (errorType === ErrorCodes.IP_BAN) {
      state.consecutiveDomTimeouts = (state.consecutiveDomTimeouts || 0) + 1;
      Logger.warn(`${rowLabel} IP ban confirmado via API: ${err.message.substring(0, 200)}`);
      await enterBanPause(state);
      return true;
    }

    if (errorType === ErrorCodes.DOM_TIMEOUT) {
      state.consecutiveDomTimeouts = (state.consecutiveDomTimeouts || 0) + 1;
      Logger.warn(`${rowLabel} DOM timeout consecutivo #${state.consecutiveDomTimeouts}`);

      if (state.consecutiveDomTimeouts >= BAN_CONSECUTIVE_THRESHOLD) {
        await uploadScreenshotSafely(token, row.refCatastral || "dom-timeout", err.screenshot, rowLabel);
        await enterBanPause(state);
        return true;
      }
    } else {
      state.consecutiveDomTimeouts = 0;
    }

    try {
      const errorScreenshotUrl = await uploadScreenshotSafely(token, row.refCatastral || "error", err.screenshot, rowLabel);
      await SheetsApi.writeValuationResult(state.sheetId, token, row.rowIndex, {
        error: err.message,
        screenshotUrl: errorScreenshotUrl,
      });
    } catch (writeErr) {
      Logger.error(`${rowLabel} Error escribiendo fallo: ${writeErr.message}`);
      if (classifyError(writeErr.message) === ErrorCodes.TOKEN_EXPIRED) {
        await stopRunAuthExpired(state);
        return true;
      }
    }
    state.errorCount++;
    return false;
  };

  // ─── Scheduling ───

  const scheduleNextRow = async (state) => {
    const data = await chrome.storage.local.get("delayMinutes");
    let minutes = parseInt(data.delayMinutes, 10);
    if (isNaN(minutes) || minutes < 1) minutes = DEFAULT_DELAY_MINUTES;

    const jitterMinutes = ((Math.random() - 0.5) * 60) / 60;
    const totalMinutes = Math.max(1, minutes + jitterMinutes);

    const rowLabel = formatRowLabel(state.currentIndex, state.totalRows);
    Logger.info(`${rowLabel} Esperando ${Math.round(totalMinutes * 60)}s hasta la siguiente...`);

    chrome.alarms.create(ALARM_NAME, { delayInMinutes: totalMinutes });
  };

  const finishRun = async (state) => {
    if (state) {
      broadcastToPopup({
        action: "done",
        total: state.totalRows,
        ok: state.successCount,
        errors: state.errorCount,
      });
      Logger.info(`Completado: ${state.successCount} OK, ${state.errorCount} errores de ${state.totalRows}`);
    }
    await closeWorkerWindow();
    await clearState();
  };

  return { run, stop, getStatus, processNextRow, resumeAfterBan };
})();
