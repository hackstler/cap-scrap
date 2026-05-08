// content/dom-helpers.js
// Responsibility: Generic DOM utilities (sleep, waitForSelector, waitForXPath).
// These are reusable primitives with no knowledge of Idealista's page structure.

const DomHelpers = (() => {
  "use strict";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForSelector = (selector, timeoutMs) =>
    new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });

  const waitForXPath = (xpath, timeoutMs) =>
    new Promise((resolve) => {
      const evaluate = () => {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
      };

      const existing = evaluate();
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = evaluate();
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });

  const waitForEnabled = (element, timeoutMs) =>
    new Promise((resolve) => {
      if (!element.disabled) return resolve(true);

      const observer = new MutationObserver(() => {
        if (!element.disabled) {
          observer.disconnect();
          resolve(true);
        }
      });

      observer.observe(element, { attributes: true, attributeFilter: ["disabled"] });

      setTimeout(() => {
        observer.disconnect();
        resolve(!element.disabled);
      }, timeoutMs);
    });

  return { sleep, waitForSelector, waitForXPath, waitForEnabled };
})();
