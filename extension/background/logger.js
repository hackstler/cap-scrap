// background/logger.js
// Responsibility: Log buffer management, persistence, and retrieval.

var Logger = (function () {
  "use strict";

  const MAX_LOG_ENTRIES = 500;
  const STORAGE_KEY = "cap_valoraciones_logs";

  let entries = [];

  function initialize() {
    chrome.storage.local.get(STORAGE_KEY, function (data) {
      if (data[STORAGE_KEY]) {
        entries = data[STORAGE_KEY];
      }
    });
  }

  function add(level, message) {
    var entry = {
      time: new Date().toISOString(),
      level: level,
      message: message,
    };
    entries.push(entry);
    if (entries.length > MAX_LOG_ENTRIES) {
      entries = entries.slice(-MAX_LOG_ENTRIES);
    }
    chrome.storage.local.set({ [STORAGE_KEY]: entries });
  }

  function info(message) {
    add("info", message);
  }

  function warn(message) {
    add("warn", message);
  }

  function error(message) {
    add("error", message);
  }

  function getAll() {
    return entries;
  }

  function clear() {
    entries = [];
    chrome.storage.local.remove(STORAGE_KEY);
  }

  initialize();

  return {
    add: add,
    info: info,
    warn: warn,
    error: error,
    getAll: getAll,
    clear: clear,
  };
})();
