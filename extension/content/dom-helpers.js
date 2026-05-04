// content/dom-helpers.js
// Responsibility: Generic DOM utilities (sleep, waitForSelector, waitForXPath).
// These are reusable primitives with no knowledge of Idealista's page structure.

var DomHelpers = (function () {
  "use strict";

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Waits for an element matching a CSS selector to appear in the DOM.
   * Uses MutationObserver for efficiency instead of polling.
   * Returns null if the element does not appear within the timeout.
   */
  function waitForSelector(selector, timeoutMs) {
    return new Promise(function (resolve) {
      var existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      var observer = new MutationObserver(function () {
        var el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(function () {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  /**
   * Waits for an element matching an XPath expression to appear in the DOM.
   * Uses MutationObserver for efficiency instead of polling.
   * Returns null if the element does not appear within the timeout.
   */
  function waitForXPath(xpath, timeoutMs) {
    return new Promise(function (resolve) {
      function evaluate() {
        var result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
      }

      var existing = evaluate();
      if (existing) return resolve(existing);

      var observer = new MutationObserver(function () {
        var el = evaluate();
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(function () {
        observer.disconnect();
        resolve(null);
      }, timeoutMs);
    });
  }

  return {
    sleep: sleep,
    waitForSelector: waitForSelector,
    waitForXPath: waitForXPath,
  };
})();
