// background/logger.js
// Responsibility: Log buffer management, persistence, and retrieval.

const Logger = (() => {
  "use strict";

  const MAX_LOG_ENTRIES = 500;
  const STORAGE_KEY = "cap_valoraciones_logs";

  let entries = [];

  const initialize = () => {
    chrome.storage.local.get(STORAGE_KEY, (data) => {
      if (data[STORAGE_KEY]) {
        entries = data[STORAGE_KEY];
      }
    });
  };

  const add = (level, message) => {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
    };
    entries.push(entry);
    if (entries.length > MAX_LOG_ENTRIES) {
      entries = entries.slice(-MAX_LOG_ENTRIES);
    }
    chrome.storage.local.set({ [STORAGE_KEY]: entries });
  };

  const info = (message) => add("info", message);
  const warn = (message) => add("warn", message);
  const error = (message) => add("error", message);
  const getAll = () => entries;

  const clear = () => {
    entries = [];
    chrome.storage.local.remove(STORAGE_KEY);
  };

  initialize();

  return { add, info, warn, error, getAll, clear };
})();
