// popup.js
// Responsibility: Popup UI logic. Handles user input, OAuth flow, and
// displays progress/status messages from the background service worker.

(() => {
  "use strict";

  // ─── DOM References ───
  const startButton = document.getElementById("startBtn");
  const stopButton = document.getElementById("stopBtn");
  const statusDisplay = document.getElementById("status");
  const sheetIdInput = document.getElementById("sheetId");
  const tabNameInput = document.getElementById("tabName");
  const colRefCatastralInput = document.getElementById("colRefCatastral");
  const colResultStartInput = document.getElementById("colResultStart");
  const emailInput = document.getElementById("email");
  const delayMinutesInput = document.getElementById("delayMinutes");
  const logsButton = document.getElementById("logsBtn");
  const testTokenButton = document.getElementById("testTokenBtn");

  // ─── Saved Config ───
  const CONFIG_KEYS = ["sheetId", "tabName", "email", "delayMinutes", "colRefCatastral", "colResultStart"];

  const loadSavedConfig = () => {
    chrome.storage.local.get(CONFIG_KEYS, (data) => {
      if (data.sheetId) sheetIdInput.value = data.sheetId;
      if (data.tabName) tabNameInput.value = data.tabName;
      if (data.email) emailInput.value = data.email;
      if (data.delayMinutes !== undefined) delayMinutesInput.value = data.delayMinutes;
      if (data.colRefCatastral) colRefCatastralInput.value = data.colRefCatastral;
      if (data.colResultStart) colResultStartInput.value = data.colResultStart;
    });
  };

  const saveConfig = (config) => {
    chrome.storage.local.set(config);
  };

  // ─── UI State ───
  let countdownInterval = null;

  const showStatus = (text, color = "#333") => {
    statusDisplay.style.display = "block";
    statusDisplay.style.color = color;
    statusDisplay.textContent = text;
  };

  const clearCountdown = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  const setRunningState = (statusInfo) => {
    clearCountdown();
    startButton.disabled = true;
    stopButton.style.display = "block";
    let text = `En proceso... ${statusInfo.current}/${statusInfo.total}`;
    if (statusInfo.ref) text += `: ${statusInfo.ref}`;
    showStatus(text);
  };

  const setIdleState = () => {
    clearCountdown();
    startButton.disabled = false;
    stopButton.style.display = "none";
  };

  const updateBanCountdown = (resumeTime, current, total) => {
    const remainingMs = new Date(resumeTime).getTime() - Date.now();
    if (remainingMs <= 0) {
      showStatus(`Reanudando tras pausa por baneo IP... (${current}/${total})`, "#007bff");
      clearCountdown();
      return;
    }
    const remainingMin = Math.ceil(remainingMs / 60000);
    showStatus(`Pausado por baneo IP — reanuda en ${remainingMin} min (${current}/${total})`, "#e67e22");
  };

  const setBanPauseState = (resumeTime, current, total) => {
    startButton.disabled = true;
    stopButton.style.display = "block";
    updateBanCountdown(resumeTime, current, total);
    clearCountdown();
    countdownInterval = setInterval(() => updateBanCountdown(resumeTime, current, total), 1000);
  };

  // ─── Status Check ───
  const checkIfAlreadyRunning = () => {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      if (response?.running) {
        if (response.pausedForBan && response.banPauseResumeTime) {
          setBanPauseState(response.banPauseResumeTime, response.current, response.total);
        } else {
          setRunningState(response);
        }
      }
    });
  };

  // ─── OAuth (authorization code flow con refresh token) ───
  const authenticateAndStart = (sheetId, email) => {
    chrome.storage.local.get("refreshToken", (data) => {
      if (data.refreshToken) {
        chrome.runtime.sendMessage({ action: "start", sheetId, email });
        setRunningState({ current: 0, total: "..." });
      } else {
        doInteractiveAuth(sheetId, email);
      }
    });
  };

  const doInteractiveAuth = (sheetId, email) => {
    chrome.runtime.sendMessage({ action: "getClientId" }, (response) => {
      const clientId = response?.clientId;
      if (!clientId) {
        showStatus("Error: CLIENT_ID no configurado", "red");
        return;
      }

      const redirectUri = chrome.identity.getRedirectURL();
      const scopes = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          const errorMessage = chrome.runtime.lastError?.message || "cancelado";
          showStatus(`Error de autenticacion: ${errorMessage}`, "red");
          return;
        }

        const code = new URL(responseUrl).searchParams.get("code");
        if (!code) {
          showStatus("Error: no se obtuvo codigo de autorizacion", "red");
          return;
        }

        chrome.runtime.sendMessage({ action: "start", sheetId, email, authCode: code });
        setRunningState({ current: 0, total: "..." });
      });
    });
  };

  // ─── Progress Listener ───
  const handleBackgroundMessages = (msg) => {
    if (msg.action === "progress") {
      clearCountdown();
      showStatus(`Procesando ${msg.current}/${msg.total}: ${msg.ref || "..."}`, "#333");
    } else if (msg.action === "done") {
      setIdleState();
      showStatus(`Terminado: ${msg.ok} OK, ${msg.errors} errores de ${msg.total}`, "green");
    } else if (msg.action === "error") {
      setIdleState();
      showStatus(`Error: ${msg.message}`, "red");
    } else if (msg.action === "banPause") {
      setBanPauseState(msg.resumeTime, msg.current, msg.total);
    } else if (msg.action === "banResumed") {
      clearCountdown();
      setRunningState({ current: msg.current, total: msg.total });
    }
  };

  // ─── Log Download ───
  const downloadLogs = () => {
    chrome.runtime.sendMessage({ action: "getLogs" }, (response) => {
      const logs = response?.logs || [];
      if (logs.length === 0) {
        showStatus("No hay logs", "#666");
        return;
      }

      const textContent = logs
        .map((entry) => `[${entry.time}] [${entry.level.toUpperCase()}] ${entry.message}`)
        .join("\n");
      const blob = new Blob([textContent], { type: "text/plain" });
      const downloadUrl = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: downloadUrl,
        filename: "cap-valoraciones-logs.txt",
        saveAs: false,
      });

      showStatus(`${logs.length} logs descargados`);
    });
  };

  // ─── Input Validation ───
  const COLUMN_REGEX = /^[A-Z]{1,2}$/;

  const validateInputs = () => {
    const sheetId = sheetIdInput.value.trim();
    const email = emailInput.value.trim();

    if (!sheetId || !email) {
      showStatus("Rellena Sheet ID y email", "red");
      return null;
    }

    return { sheetId, email };
  };

  // ─── Event Binding ───
  startButton.addEventListener("click", () => {
    const inputs = validateInputs();
    if (!inputs) return;

    let delayVal = parseInt(delayMinutesInput.value, 10);
    if (isNaN(delayVal) || delayVal < 1) delayVal = 3;

    const colRef = (colRefCatastralInput.value.trim() || "G").toUpperCase();
    const colStart = (colResultStartInput.value.trim() || "K").toUpperCase();

    if (!COLUMN_REGEX.test(colRef)) {
      showStatus("Columna ref. catastral no valida (ej: G, D, AA)", "red");
      return;
    }
    if (!COLUMN_REGEX.test(colStart)) {
      showStatus("Columna inicio resultados no valida (ej: K, H, M)", "red");
      return;
    }

    saveConfig({
      sheetId: inputs.sheetId,
      tabName: tabNameInput.value.trim() || "ORIGINAL",
      email: inputs.email,
      delayMinutes: delayVal,
      colRefCatastral: colRef,
      colResultStart: colStart,
    });

    authenticateAndStart(inputs.sheetId, inputs.email);
  });

  stopButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stop" });
    clearCountdown();
    setIdleState();
    showStatus("Parado por el usuario", "#666");
  });

  testTokenButton.addEventListener("click", () => {
    showStatus("Probando refresh token...", "#007bff");
    chrome.runtime.sendMessage({ action: "testToken" }, (response) => {
      if (response?.ok) {
        showStatus("OK: refresh token funciona. Access token obtenido.", "green");
      } else {
        showStatus(`FALLO: ${response?.error || "sin respuesta"}`, "red");
      }
    });
  });

  logsButton.addEventListener("click", downloadLogs);
  chrome.runtime.onMessage.addListener(handleBackgroundMessages);

  // ─── Initialize ───
  loadSavedConfig();
  checkIfAlreadyRunning();
})();
