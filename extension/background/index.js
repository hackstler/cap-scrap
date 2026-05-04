// background/index.js
// Service worker entry point and message router.
// Loads all background modules via importScripts, then routes messages
// to the appropriate handler.

importScripts(
  "logger.js",
  "sheets-api.js",
  "drive-api.js",
  "orchestrator.js"
);

var OAUTH_CLIENT_ID = "1094840910871-6s5cd8gt33utosjrcahdbm36dj42arvo.apps.googleusercontent.com";

// ─── Message Router ───
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  switch (msg.action) {
    case "getClientId":
      sendResponse({ clientId: OAUTH_CLIENT_ID });
      return;

    case "getStatus":
      sendResponse(Orchestrator.getStatus());
      return;

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

    case "start":
      if (Orchestrator.getStatus().running) {
        sendResponse({ error: "Ya está en ejecución" });
        return;
      }
      Orchestrator.run(msg.sheetId, msg.email, msg.token);
      sendResponse({ ok: true });
      return;

    case "stop":
      Orchestrator.stop();
      sendResponse({ ok: true });
      return;
  }
});
