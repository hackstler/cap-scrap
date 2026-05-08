// content/page-interceptor.js
// Runs in MAIN world (page context). Monkey-patches fetch and XHR
// to capture HTTP responses from Idealista's vendorleads API and relay
// them to the ISOLATED world content script via window.postMessage.
// Uses ES5 syntax because it executes in the page's JS context.

(function () {
  "use strict";

  var MSG_TYPE = "cap-valoraciones-api-intercept";
  var CAPTURE_PATH = "/vendorleads/";

  var postCapture = function (payload) {
    window.postMessage({ type: MSG_TYPE, payload: payload }, "*");
  };

  var shouldCapture = function (url) {
    return url.indexOf(CAPTURE_PATH) !== -1;
  };

  // ─── Patch fetch ───

  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var url = args[0];
    if (typeof url === "object" && url.url) url = url.url;
    url = String(url);

    if (!shouldCapture(url)) return originalFetch.apply(this, args);

    return originalFetch.apply(this, args).then(function (response) {
      response.clone().text().then(function (body) {
        postCapture({
          source: "fetch",
          url: url,
          status: response.status,
          statusText: response.statusText,
          body: body.substring(0, 5000),
        });
      }).catch(function () {});
      return response;
    });
  };

  // ─── Patch XMLHttpRequest ───

  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._capUrl = String(url);
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var self = this;
    if (shouldCapture(self._capUrl)) {
      this.addEventListener("load", function () {
        postCapture({
          source: "xhr",
          url: self._capUrl,
          status: self.status,
          statusText: self.statusText,
          body: (self.responseText || "").substring(0, 5000),
        });
      });
    }
    return originalSend.apply(this, arguments);
  };
})();
