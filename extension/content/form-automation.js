// content/form-automation.js
// Responsibility: Automates the Idealista valuation form step by step.
// Each step is a separate function for clarity and testability.

const FormAutomation = (() => {
  "use strict";

  const COOKIE_ACCEPT_SELECTOR = "#didomi-notice-agree-button";
  const CONTINUE_BUTTON_XPATH = "//button[contains(., 'Continuar')]";
  const INFORMING_RADIO_XPATH = "//label[contains(., 'informando')]";
  const EMAIL_INPUT_SELECTOR = "#email";
  const PRIVACY_CHECKBOX_SELECTOR = "input[name='privacy']";
  const SUBMIT_BUTTON_XPATH = "//button[contains(., 'valoración')]";

  const INITIAL_LOAD_DELAY_MS = 2000;
  const POST_COOKIE_DELAY_MS = 1000;
  const POST_FOCUS_DELAY_MS = 200;
  const POST_EMAIL_DELAY_MS = 200;
  const PRE_PRIVACY_DELAY_MS = 500;
  const PRE_SUBMIT_DELAY_MS = 500;
  const SUBMIT_WAIT_TIMEOUT_MS = 8000;
  const SUBMIT_ENABLED_TIMEOUT_MS = 5000;
  const SUBMIT_RETRY_ATTEMPTS = 3;
  const SUBMIT_RETRY_DELAY_MS = 1500;

  const acceptCookies = async (log) => {
    log(1, "Esperando 2s para carga inicial...");
    await DomHelpers.sleep(INITIAL_LOAD_DELAY_MS);

    const cookieButton = document.querySelector(COOKIE_ACCEPT_SELECTOR);
    if (cookieButton && cookieButton.offsetParent !== null) {
      cookieButton.click();
      log(1, "Cookies aceptadas");
    } else {
      log(1, "No hay banner de cookies (OK)");
    }

    await DomHelpers.sleep(POST_COOKIE_DELAY_MS);
  };

  const clickContinueButton = async (log) => {
    log(2, "Buscando boton 'Continuar'...");
    const button = await DomHelpers.waitForXPath(CONTINUE_BUTTON_XPATH, 8000);
    if (!button) throw new Error("Boton 'Continuar' no encontrado");
    log(2, "Boton encontrado, clicking...");
    button.click();
    log(2, "OK");
  };

  const selectInformingRadio = async (log) => {
    log(3, "Buscando radio 'informando'...");
    const radioLabel = await DomHelpers.waitForXPath(INFORMING_RADIO_XPATH, 8000);
    if (!radioLabel) throw new Error("Radio 'informando' no encontrado");
    radioLabel.click();
    log(3, "OK");
  };

  const fillEmailField = async (email, log) => {
    log(4, "Buscando campo email...");
    const emailInput = await DomHelpers.waitForSelector(EMAIL_INPUT_SELECTOR, 5000);
    if (!emailInput) throw new Error("Campo email no encontrado");

    emailInput.focus();
    emailInput.click();
    await DomHelpers.sleep(POST_FOCUS_DELAY_MS);
    document.execCommand("insertText", false, email);
    await DomHelpers.sleep(POST_EMAIL_DELAY_MS);

    log(4, `Email value: "${emailInput.value}"`);
  };

  const checkPrivacyConsent = async (log) => {
    log(5, "Buscando checkbox privacy...");
    await DomHelpers.sleep(PRE_PRIVACY_DELAY_MS);

    const privacyCheckbox = document.querySelector(PRIVACY_CHECKBOX_SELECTOR);
    if (!privacyCheckbox) throw new Error("Checkbox privacy no encontrado");

    if (!privacyCheckbox.checked) {
      privacyCheckbox.click();
    }
    log(5, `OK - checked: ${privacyCheckbox.checked}`);

    if (!privacyCheckbox.checked) {
      log(5, "Click no marco el checkbox, forzando via .checked = true");
      privacyCheckbox.checked = true;
      privacyCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const clickSubmitButton = async (log) => {
    log(6, "Buscando boton 'Ver valoracion'...");
    await DomHelpers.sleep(PRE_SUBMIT_DELAY_MS);

    const submitButton = await DomHelpers.waitForXPath(SUBMIT_BUTTON_XPATH, SUBMIT_WAIT_TIMEOUT_MS);
    if (!submitButton) throw new Error("Boton 'Ver valoracion' no encontrado");

    if (submitButton.disabled) {
      log(6, "Boton disabled, esperando a que se habilite...");
      await DomHelpers.waitForEnabled(submitButton, SUBMIT_ENABLED_TIMEOUT_MS);
    }

    if (submitButton.disabled) {
      log(6, "Boton sigue disabled tras espera, intentando click igualmente");
    }

    for (let attempt = 1; attempt <= SUBMIT_RETRY_ATTEMPTS; attempt++) {
      log(6, `Click intento ${attempt}/${SUBMIT_RETRY_ATTEMPTS} (disabled=${submitButton.disabled})`);
      submitButton.click();
      submitButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

      await DomHelpers.sleep(SUBMIT_RETRY_DELAY_MS);

      const stillOnForm = document.querySelector(PRIVACY_CHECKBOX_SELECTOR);
      if (!stillOnForm) {
        log(6, "OK - formulario enviado, esperando resultados en el DOM...");
        return;
      }

      if (attempt < SUBMIT_RETRY_ATTEMPTS) {
        log(6, "Formulario sigue visible, reintentando click...");
      }
    }

    log(6, "Formulario sigue visible tras reintentos, continuando igualmente...");
  };

  const automateValuationForm = async (email, log) => {
    await acceptCookies(log);
    await clickContinueButton(log);
    await selectInformingRadio(log);
    await fillEmailField(email, log);
    await checkPrivacyConsent(log);
    await clickSubmitButton(log);
  };

  return { automateValuationForm };
})();
