// background/orchestrator.js
// Responsibility: Main run loop that processes pending rows one by one.
// Coordinates between Sheets, Drive, and content script automation.

var Orchestrator = (function () {
  "use strict";

  var IDEALISTA_VALUATOR_BASE_URL = "https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=";
  var VALUATION_TIMEOUT_MS = 45000;
  var MIN_DELAY_BETWEEN_ROWS_MS = 8000;
  var MAX_ADDITIONAL_DELAY_MS = 4000;

  var isRunning = false;
  var isStopped = false;
  var isBackgroundMode = false;
  var currentRowIndex = 0;
  var totalRows = 0;

  function getStatus() {
    return {
      running: isRunning,
      current: currentRowIndex,
      total: totalRows,
    };
  }

  function stop() {
    isStopped = true;
    isRunning = false;
  }

  function broadcastToPopup(message) {
    chrome.runtime.sendMessage(message).catch(function () {});
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function randomDelayBetweenRows() {
    return MIN_DELAY_BETWEEN_ROWS_MS + Math.random() * MAX_ADDITIONAL_DELAY_MS;
  }

  /**
   * Opens an Idealista valuator tab and waits for the content script to
   * complete the automation and send back the valuation result.
   */
  function captureTabScreenshot(windowId) {
    return new Promise(function (resolve) {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, function (dataUrl) {
        if (chrome.runtime.lastError) {
          Logger.warn("Screenshot: " + chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(dataUrl || null);
        }
      });
    });
  }

  function processProperty(refCatastral, email) {
    return new Promise(function (resolve, reject) {
      var url = IDEALISTA_VALUATOR_BASE_URL + refCatastral;
      var tabId = null;
      var timeoutHandle = null;

      function closeTab() {
        if (tabId) {
          chrome.tabs.remove(tabId).catch(function () {});
        }
      }

      function resultListener(msg, sender) {
        if (sender.tab?.id !== tabId) return;

        if (msg.action === "valuationResult") {
          clearTimeout(timeoutHandle);
          chrome.runtime.onMessage.removeListener(resultListener);

          if (msg.error) {
            closeTab();
            reject(new Error(msg.error));
            return;
          }

          if (isBackgroundMode) {
            closeTab();
            resolve(msg.data);
            return;
          }

          // Screenshot from orchestrator: tab is still open and active
          captureTabScreenshot(sender.tab.windowId).then(function (dataUrl) {
            if (dataUrl) {
              msg.data.screenshot = dataUrl;
              Logger.info("Screenshot capturado OK");
            } else {
              Logger.warn("Screenshot no disponible");
            }
            closeTab();
            resolve(msg.data);
          });
        }
      }

      chrome.runtime.onMessage.addListener(resultListener);

      chrome.tabs.create({ url: url, active: !isBackgroundMode }, function (tab) {
        tabId = tab.id;
        chrome.storage.local.set({ currentEmail: email });

        timeoutHandle = setTimeout(function () {
          clearTimeout(timeoutHandle);
          chrome.runtime.onMessage.removeListener(resultListener);
          closeTab();
          reject(new Error("Timeout (45s)"));
        }, VALUATION_TIMEOUT_MS);
      });
    });
  }

  /**
   * Uploads a screenshot to Drive and returns the URL.
   * Returns empty string if no screenshot or upload fails.
   */
  async function uploadScreenshotSafely(token, refCatastral, screenshotDataUrl, rowLabel) {
    if (!screenshotDataUrl) {
      return "";
    }

    try {
      var url = await DriveApi.uploadScreenshot(token, refCatastral, screenshotDataUrl);
      Logger.info(rowLabel + " Screenshot subido a Drive");
      return url;
    } catch (err) {
      Logger.warn(rowLabel + " Error subiendo screenshot: " + err.message);
      return "";
    }
  }

  /**
   * Processes a single row: automate valuation, upload screenshot, write to sheet.
   */
  async function processSingleRow(sheetId, token, email, row, rowLabel) {
    var ref = row.refCatastral;

    if (!ref) {
      Logger.warn("Fila " + row.rowIndex + ": Sin referencia catastral");
      await SheetsApi.writeValuationResult(sheetId, token, row.rowIndex, { error: "Sin referencia catastral" });
      return { success: false };
    }

    Logger.info(rowLabel + " Procesando fila " + row.rowIndex + ": " + ref);

    var result = await processProperty(ref, email);
    Logger.info(rowLabel + " OK: Venta " + result.valoracionVenta + " | Alquiler " + result.valoracionAlquiler);

    var screenshotUrl = await uploadScreenshotSafely(token, ref, result.screenshot, rowLabel);

    await SheetsApi.writeValuationResult(sheetId, token, row.rowIndex, {
      venta: result.valoracionVenta,
      alquiler: result.valoracionAlquiler,
      screenshotUrl: screenshotUrl,
    });

    return { success: true };
  }

  /**
   * Main entry point: reads pending rows and processes them sequentially.
   */
  async function run(sheetId, email, token) {
    isRunning = true;
    isStopped = false;
    currentRowIndex = 0;

    var config = await chrome.storage.local.get("backgroundMode");
    isBackgroundMode = !!config.backgroundMode;

    var successCount = 0;
    var errorCount = 0;

    try {
      Logger.info("Leyendo filas del Sheet...");
      var rows = await SheetsApi.readPendingRows(sheetId, token);
      totalRows = rows.length;
      Logger.info(totalRows + " filas pendientes encontradas");

      if (totalRows === 0) {
        broadcastToPopup({ action: "error", message: "No hay filas pendientes (columna N sin TRUE)" });
        isRunning = false;
        return;
      }

      Logger.info("Preparando carpeta de screenshots en Drive...");
      var folderId = await DriveApi.ensureFolder(token);
      Logger.info("Carpeta Drive lista: " + folderId);

      broadcastToPopup({ action: "progress", current: 0, total: totalRows, ref: "Leyendo sheet..." });

      for (var i = 0; i < rows.length; i++) {
        if (isStopped) break;

        var row = rows[i];
        currentRowIndex = i + 1;
        var rowLabel = "[" + currentRowIndex + "/" + totalRows + "]";

        broadcastToPopup({
          action: "progress",
          current: currentRowIndex,
          total: totalRows,
          ref: row.refCatastral || row.calle,
        });

        try {
          var outcome = await processSingleRow(sheetId, token, email, row, rowLabel);
          if (outcome.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          Logger.error(rowLabel + " FALLO fila " + row.rowIndex + ": " + err.message);
          await SheetsApi.writeValuationResult(sheetId, token, row.rowIndex, { error: err.message });
          errorCount++;
        }

        var isNotLastRow = !isStopped && currentRowIndex < totalRows;
        if (isNotLastRow) {
          await sleep(randomDelayBetweenRows());
        }
      }

      broadcastToPopup({ action: "done", total: totalRows, ok: successCount, errors: errorCount });
    } catch (err) {
      broadcastToPopup({ action: "error", message: err.message });
    }

    isRunning = false;
  }

  return {
    run: run,
    stop: stop,
    getStatus: getStatus,
  };
})();
