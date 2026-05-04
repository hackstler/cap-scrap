// content/form-automation.js
// Responsibility: Automates the Idealista valuation form step by step.
// Each step is a separate function for clarity and testability.

var FormAutomation = (function () {
  "use strict";

  var COOKIE_ACCEPT_SELECTOR = "#didomi-notice-agree-button";
  var CONTINUE_BUTTON_XPATH = "//button[contains(., 'Continuar')]";
  var INFORMING_RADIO_XPATH = "//label[contains(., 'informando')]";
  var EMAIL_INPUT_SELECTOR = "#email";
  var PRIVACY_CHECKBOX_SELECTOR = "input[name='privacy']";
  var SUBMIT_BUTTON_XPATH = "//button[contains(., 'valoración')]";

  var INITIAL_LOAD_DELAY_MS = 2000;
  var POST_COOKIE_DELAY_MS = 1000;
  var POST_FOCUS_DELAY_MS = 200;
  var POST_EMAIL_DELAY_MS = 200;
  var PRE_PRIVACY_DELAY_MS = 500;
  var PRE_SUBMIT_DELAY_MS = 500;

  /**
   * Step 1: Accept cookie banner if visible.
   */
  async function acceptCookies(log) {
    log(1, "Esperando 2s para carga inicial...");
    await DomHelpers.sleep(INITIAL_LOAD_DELAY_MS);

    var cookieButton = document.querySelector(COOKIE_ACCEPT_SELECTOR);
    if (cookieButton && cookieButton.offsetParent !== null) {
      cookieButton.click();
      log(1, "Cookies aceptadas");
    } else {
      log(1, "No hay banner de cookies (OK)");
    }

    await DomHelpers.sleep(POST_COOKIE_DELAY_MS);
  }

  /**
   * Step 2: Click the "Continuar" button.
   */
  async function clickContinueButton(log) {
    log(2, "Buscando boton 'Continuar'...");
    var button = await DomHelpers.waitForXPath(CONTINUE_BUTTON_XPATH, 8000);
    if (!button) throw new Error("Boton 'Continuar' no encontrado");
    log(2, "Boton encontrado, clicking...");
    button.click();
    log(2, "OK");
  }

  /**
   * Step 3: Select the "informando" radio option.
   */
  async function selectInformingRadio(log) {
    log(3, "Buscando radio 'informando'...");
    var radioLabel = await DomHelpers.waitForXPath(INFORMING_RADIO_XPATH, 8000);
    if (!radioLabel) throw new Error("Radio 'informando' no encontrado");
    radioLabel.click();
    log(3, "OK");
  }

  /**
   * Step 4: Fill in the email field.
   * Uses execCommand("insertText") because Idealista uses React controlled inputs.
   */
  async function fillEmailField(email, log) {
    log(4, "Buscando campo email...");
    var emailInput = await DomHelpers.waitForSelector(EMAIL_INPUT_SELECTOR, 5000);
    if (!emailInput) throw new Error("Campo email no encontrado");

    emailInput.focus();
    emailInput.click();
    await DomHelpers.sleep(POST_FOCUS_DELAY_MS);
    document.execCommand("insertText", false, email);
    await DomHelpers.sleep(POST_EMAIL_DELAY_MS);

    log(4, 'Email value: "' + emailInput.value + '"');
  }

  /**
   * Step 5: Check the privacy consent checkbox.
   */
  async function checkPrivacyConsent(log) {
    log(5, "Buscando checkbox privacy...");
    await DomHelpers.sleep(PRE_PRIVACY_DELAY_MS);

    var privacyCheckbox = document.querySelector(PRIVACY_CHECKBOX_SELECTOR);
    if (!privacyCheckbox) throw new Error("Checkbox privacy no encontrado");

    privacyCheckbox.click();
    log(5, "OK - checked: " + privacyCheckbox.checked);
  }

  /**
   * Step 6: Click the "Ver valoracion" submit button.
   */
  async function clickSubmitButton(log) {
    log(6, "Buscando boton 'Ver valoracion'...");
    await DomHelpers.sleep(PRE_SUBMIT_DELAY_MS);

    var submitButton = await DomHelpers.waitForXPath(SUBMIT_BUTTON_XPATH, 3000);
    if (!submitButton) throw new Error("Boton 'Ver valoracion' no encontrado");

    log(6, "Boton encontrado (disabled=" + submitButton.disabled + "), clicking...");
    submitButton.click();
    log(6, "OK - esperando resultados en el DOM...");
  }

  /**
   * Runs all form automation steps in sequence.
   */
  async function automateValuationForm(email, log) {
    await acceptCookies(log);
    await clickContinueButton(log);
    await selectInformingRadio(log);
    await fillEmailField(email, log);
    await checkPrivacyConsent(log);
    await clickSubmitButton(log);
  }

  return {
    automateValuationForm: automateValuationForm,
  };
})();
