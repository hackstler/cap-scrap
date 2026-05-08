// content/index.js
// Content script entry point. Orchestrates the full automation flow:
// form automation -> wait for API response -> extract prices -> report back.
// Depends on: api-interceptor.js, dom-helpers.js, form-automation.js,
// price-extractor.js (loaded before this file).

(() => {
  "use strict";

  const TAG = "[CAP-VALORACIONES]";
  const VALUATION_WAIT_TIMEOUT_MS = 30000;

  // Error prefixes — must match ErrorCodes in background/error-codes.js
  const ERROR_IP_BAN = "IP_BAN";
  const ERROR_API = "API_ERROR";
  const ERROR_DOM_TIMEOUT = "DOM_TIMEOUT";

  const log = (step, message) => {
    const line = `Step ${step}: ${message}`;
    console.log(`${TAG} ${line}`);
    chrome.runtime.sendMessage({ action: "log", level: "info", message: line });
  };

  const logError = (step, message) => {
    const line = `Step ${step} FAILED: ${message}`;
    console.error(`${TAG} ${line}`);
    chrome.runtime.sendMessage({ action: "log", level: "error", message: line });
  };

  const sendValuationResult = (data) => {
    chrome.runtime.sendMessage({ action: "valuationResult", data });
  };

  const sendValuationError = (errorMessage) => {
    chrome.runtime.sendMessage({ action: "valuationResult", error: errorMessage });
  };

  const loadEmailFromStorage = async () => {
    const { currentEmail } = await chrome.storage.local.get("currentEmail");
    if (!currentEmail) throw new Error("No email configured");
    return currentEmail;
  };

  const waitForAndExtractPrices = async () => {
    log(7, "Esperando respuesta API de valoracion (max 30s)...");
    const apiData = await PriceExtractor.waitForValuationApiResponse(VALUATION_WAIT_TIMEOUT_MS);

    if (!apiData) {
      const banAnalysis = ApiInterceptor.analyzeForBan();
      if (banAnalysis?.isBan) {
        throw new Error(`${ERROR_IP_BAN}: ${banAnalysis.reason} | ${banAnalysis.detail}`);
      }
      if (banAnalysis && !banAnalysis.isBan) {
        throw new Error(`${ERROR_API}: ${banAnalysis.reason} | ${banAnalysis.detail}`);
      }
      throw new Error(`${ERROR_DOM_TIMEOUT}: La respuesta API de valoracion no llego (30s)`);
    }

    // Check ban flags in API response
    const user = apiData?.body?.data?.user;
    if (user?.isBanned || user?.isLimitExceeded) {
      const reason = user.isBanned ? "user.isBanned=true" : "user.isLimitExceeded=true";
      throw new Error(`${ERROR_IP_BAN}: API flag ${reason}`);
    }

    const prices = PriceExtractor.extractPricesFromResponse(apiData);
    if (!prices) {
      throw new Error(`${ERROR_API}: No se pudieron extraer precios del JSON de la API`);
    }

    return prices;
  };

  const runValuationAutomation = async () => {
    console.log(`${TAG} ========================================`);
    console.log(`${TAG} Content script loaded on: ${location.href}`);
    console.log(`${TAG} ========================================`);

    const email = await loadEmailFromStorage();
    log(0, `Email configurado: ${email}`);

    await FormAutomation.automateValuationForm(email, log);

    const result = await waitForAndExtractPrices();
    log(7, `Max venta: ${result.maxVenta}`);
    log(7, `Min venta: ${result.minVenta}`);

    sendValuationResult(result);
    log(7, "COMPLETADO CON EXITO");
  };

  runValuationAutomation().catch((err) => {
    logError("X", err.message);
    sendValuationError(err.message);
  });
})();
