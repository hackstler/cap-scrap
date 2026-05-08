// background/index.js
// Service worker entry point and message router.
// Loads all background modules via importScripts, then routes messages
// to the appropriate handler.

importScripts(
  "config.js",
  "error-codes.js",
  "logger.js",
  "token-manager.js",
  "sheets-api.js",
  "drive-api.js",
  "orchestrator.js"
);

// ─── Alarm Handler (wakes service worker to process next row) ───
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cap-next-row") {
    Orchestrator.processNextRow();
  } else if (alarm.name === "cap-resume-after-ban") {
    Orchestrator.resumeAfterBan();
  }
});

// ─── Message Router ───
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case "getClientId":
      sendResponse({ clientId: OAUTH_CLIENT_ID });
      return;

    case "getStatus":
      Orchestrator.getStatus().then((status) => sendResponse(status));
      return true;

    case "getLogs":
      sendResponse({ logs: Logger.getAll() });
      return;

    case "clearLogs":
      Logger.clear();
      sendResponse({ ok: true });
      return;

    case "log":
      Logger.add(msg.level, msg.message);
      return;

    case "testToken":
      (async () => {
        try {
          const { refreshToken } = await chrome.storage.local.get("refreshToken");
          if (!refreshToken) {
            Logger.warn("TEST: No hay refresh token almacenado. Haz click en Empezar primero para autenticarte.");
            sendResponse({ ok: false, error: "No hay refresh token. Pulsa Empezar primero." });
            return;
          }
          Logger.info("TEST 1/3: Refresh token encontrado en storage.");

          const token = await TokenManager.refreshAccessToken();
          Logger.info(`TEST 2/3: Access token obtenido de Google OK (primeros 20 chars: ${token.substring(0, 20)}...)`);

          const { sheetId } = await chrome.storage.local.get("sheetId");
          if (!sheetId) {
            Logger.warn("TEST 3/3: No hay Sheet ID guardado, no puedo verificar contra Sheets API. Pero el token es valido.");
            sendResponse({ ok: true });
            return;
          }

          const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:A1`;
          const sheetResponse = await fetch(sheetUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!sheetResponse.ok) {
            const errBody = await sheetResponse.text();
            Logger.error(`TEST 3/3: Token obtenido pero Sheets API devolvio ${sheetResponse.status}: ${errBody.substring(0, 200)}`);
            sendResponse({ ok: false, error: `Token OK pero Sheets fallo: ${sheetResponse.status}` });
            return;
          }

          const sheetData = await sheetResponse.json();
          const cellValue = sheetData.values?.[0]?.[0] || "(vacio)";
          Logger.info(`TEST 3/3: Sheets API OK. Celda A1 = "${cellValue}". Token 100% funcional.`);
          sendResponse({ ok: true });
        } catch (err) {
          Logger.error(`TEST FALLO: ${err.message}`);
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;

    case "start":
      Orchestrator.getStatus().then((status) => {
        if (status.running) {
          sendResponse({ error: "Ya esta en ejecucion" });
          return;
        }
        Orchestrator.run(msg.sheetId, msg.email, msg.authCode || null);
        sendResponse({ ok: true });
      });
      return true;

    case "stop":
      Orchestrator.stop().then(() => sendResponse({ ok: true }));
      return true;
  }
});
