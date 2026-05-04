// popup.js
// Responsibility: Popup UI logic. Handles user input, OAuth flow, and
// displays progress/status messages from the background service worker.

(function () {
  "use strict";

  // ─── DOM References ───
  var startButton = document.getElementById("startBtn");
  var stopButton = document.getElementById("stopBtn");
  var statusDisplay = document.getElementById("status");
  var sheetIdInput = document.getElementById("sheetId");
  var tabNameInput = document.getElementById("tabName");
  var emailInput = document.getElementById("email");
  var backgroundModeCheckbox = document.getElementById("backgroundMode");
  var logsButton = document.getElementById("logsBtn");

  // ─── Saved Config ───
  function loadSavedConfig() {
    chrome.storage.local.get(["sheetId", "tabName", "email", "backgroundMode"], function (data) {
      if (data.sheetId) sheetIdInput.value = data.sheetId;
      if (data.tabName) tabNameInput.value = data.tabName;
      if (data.email) emailInput.value = data.email;
      if (data.backgroundMode) backgroundModeCheckbox.checked = true;
    });
  }

  function saveConfig(sheetId, tabName, email, backgroundMode) {
    chrome.storage.local.set({ sheetId: sheetId, tabName: tabName, email: email, backgroundMode: backgroundMode });
  }

  // ─── UI State ───
  function showStatus(text, color) {
    statusDisplay.style.display = "block";
    statusDisplay.style.color = color || "#333";
    statusDisplay.textContent = text;
  }

  function setRunningState(statusInfo) {
    startButton.disabled = true;
    stopButton.style.display = "block";
    showStatus("En proceso... " + statusInfo.current + "/" + statusInfo.total, "#333");
  }

  function setIdleState() {
    startButton.disabled = false;
    stopButton.style.display = "none";
  }

  // ─── Status Check ───
  function checkIfAlreadyRunning() {
    chrome.runtime.sendMessage({ action: "getStatus" }, function (response) {
      if (response?.running) {
        setRunningState(response);
      }
    });
  }

  // ─── OAuth ───
  function buildAuthUrl(clientId) {
    var redirectUri = chrome.identity.getRedirectURL();
    var scopes = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";

    return "https://accounts.google.com/o/oauth2/v2/auth" +
      "?client_id=" + clientId +
      "&response_type=token" +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&scope=" + encodeURIComponent(scopes);
  }

  function extractTokenFromResponseUrl(responseUrl) {
    var urlWithQuery = responseUrl.replace("#", "?");
    return new URL(urlWithQuery).searchParams.get("access_token");
  }

  function authenticateAndStart(sheetId, email) {
    chrome.runtime.sendMessage({ action: "getClientId" }, function (response) {
      var clientId = response?.clientId;
      if (!clientId) {
        showStatus("Error: CLIENT_ID no configurado", "red");
        return;
      }

      var authUrl = buildAuthUrl(clientId);

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, function (responseUrl) {
        if (chrome.runtime.lastError || !responseUrl) {
          var errorMessage = chrome.runtime.lastError?.message || "cancelado";
          showStatus("Error de autenticación: " + errorMessage, "red");
          return;
        }

        var token = extractTokenFromResponseUrl(responseUrl);
        if (!token) {
          showStatus("Error: no se obtuvo token", "red");
          return;
        }

        chrome.runtime.sendMessage({
          action: "start",
          sheetId: sheetId,
          email: email,
          token: token,
        });

        setRunningState({ current: 0, total: "..." });
      });
    });
  }

  // ─── Progress Listener ───
  function handleBackgroundMessages(msg) {
    if (msg.action === "progress") {
      showStatus("Procesando " + msg.current + "/" + msg.total + ": " + (msg.ref || "..."), "#333");
    } else if (msg.action === "done") {
      setIdleState();
      showStatus("Terminado: " + msg.ok + " OK, " + msg.errors + " errores de " + msg.total, "green");
    } else if (msg.action === "error") {
      setIdleState();
      showStatus("Error: " + msg.message, "red");
    }
  }

  // ─── Log Download ───
  function downloadLogs() {
    chrome.runtime.sendMessage({ action: "getLogs" }, function (response) {
      var logs = response?.logs || [];
      if (logs.length === 0) {
        showStatus("No hay logs", "#666");
        return;
      }

      var formattedLines = logs.map(function (entry) {
        return "[" + entry.time + "] [" + entry.level.toUpperCase() + "] " + entry.message;
      });
      var textContent = formattedLines.join("\n");
      var blob = new Blob([textContent], { type: "text/plain" });
      var downloadUrl = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: downloadUrl,
        filename: "cap-valoraciones-logs.txt",
        saveAs: false,
      });

      showStatus(logs.length + " logs descargados", "#333");
    });
  }

  // ─── Input Validation ───
  function validateInputs() {
    var sheetId = sheetIdInput.value.trim();
    var email = emailInput.value.trim();

    if (!sheetId || !email) {
      showStatus("Rellena Sheet ID y email", "red");
      return null;
    }

    return { sheetId: sheetId, email: email };
  }

  // ─── Event Binding ───
  startButton.addEventListener("click", function () {
    var inputs = validateInputs();
    if (!inputs) return;

    saveConfig(inputs.sheetId, tabNameInput.value.trim() || "ORIGINAL", inputs.email, backgroundModeCheckbox.checked);
    authenticateAndStart(inputs.sheetId, inputs.email);
  });

  stopButton.addEventListener("click", function () {
    chrome.runtime.sendMessage({ action: "stop" });
    setIdleState();
    showStatus("Parado por el usuario", "#666");
  });

  logsButton.addEventListener("click", downloadLogs);

  chrome.runtime.onMessage.addListener(handleBackgroundMessages);

  // ─── Initialize ───
  loadSavedConfig();
  checkIfAlreadyRunning();
})();
