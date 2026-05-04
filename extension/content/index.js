// content/index.js
// Content script entry point. Orchestrates the full automation flow:
// form automation -> wait for results -> extract prices -> report back.
// Depends on: dom-helpers.js, form-automation.js, price-extractor.js (loaded before this file).

(function () {
  "use strict";

  var TAG = "[CAP-VALORACIONES]";
  var VALUATION_WAIT_TIMEOUT_MS = 30000;
  var POST_RENDER_SAFETY_DELAY_MS = 500;

  function log(step, message) {
    var line = "Step " + step + ": " + message;
    console.log(TAG + " " + line);
    chrome.runtime.sendMessage({ action: "log", level: "info", message: line });
  }

  function logError(step, message) {
    var line = "Step " + step + " FAILED: " + message;
    console.error(TAG + " " + line);
    chrome.runtime.sendMessage({ action: "log", level: "error", message: line });
  }

  function sendValuationResult(data) {
    chrome.runtime.sendMessage({
      action: "valuationResult",
      data: data,
    });
  }

  function sendValuationError(errorMessage) {
    chrome.runtime.sendMessage({
      action: "valuationResult",
      error: errorMessage,
    });
  }

  async function loadEmailFromStorage() {
    var data = await chrome.storage.local.get("currentEmail");
    if (!data.currentEmail) {
      throw new Error("No email configured");
    }
    return data.currentEmail;
  }

  async function waitForAndExtractPrices() {
    log(7, "Esperando que aparezcan AMBAS secciones de precios (max 30s)...");
    var bothReady = await PriceExtractor.waitForBothValuationSections(VALUATION_WAIT_TIMEOUT_MS);
    if (!bothReady) {
      throw new Error("Los precios no aparecieron en el DOM (30s)");
    }
    log(7, "Ambas secciones detectadas, extrayendo...");

    // Extra safety: small wait for any remaining renders
    await DomHelpers.sleep(POST_RENDER_SAFETY_DELAY_MS);

    return PriceExtractor.extractAllPrices(log);
  }

  async function runValuationAutomation() {
    console.log(TAG + " ========================================");
    console.log(TAG + " Content script loaded on: " + location.href);
    console.log(TAG + " ========================================");

    var email = await loadEmailFromStorage();
    log(0, "Email configurado: " + email);

    await FormAutomation.automateValuationForm(email, log);

    var result = waitForAndExtractPrices();
    result = await result;
    log(7, "Venta: " + result.valoracionVenta);
    log(7, "Alquiler: " + result.valoracionAlquiler);
    log(7, "Precio/m2: " + result.precioM2);

    sendValuationResult(result);
    log(7, "COMPLETADO CON EXITO");
  }

  // Main execution
  runValuationAutomation().catch(function (err) {
    logError("X", err.message);
    sendValuationError(err.message);
  });
})();
