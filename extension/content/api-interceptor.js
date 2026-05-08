// content/api-interceptor.js
// Runs in ISOLATED world. Receives API response data from the MAIN world
// page-interceptor.js via window.postMessage. Provides valuation response
// lookup and ban detection from API fields.

const ApiInterceptor = (() => {
  "use strict";

  const capturedResponses = [];
  const MESSAGE_TYPE = "cap-valoraciones-api-intercept";
  const VALUATION_URL_PATTERN = "/vendorleads/valuations/";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== MESSAGE_TYPE) return;
    capturedResponses.push(event.data.payload);
  });

  const getResponses = () => capturedResponses.slice();

  const findValuationResponse = () => {
    for (const r of capturedResponses) {
      if (r.url?.includes(VALUATION_URL_PATTERN) && r.status === 200) {
        try {
          return JSON.parse(r.body);
        } catch {
          // body wasn't valid JSON
        }
      }
    }
    return null;
  };

  const analyzeForBan = () => {
    // Check API-level ban flags in valuation responses
    for (const r of capturedResponses) {
      if (r.url?.includes(VALUATION_URL_PATTERN) && r.status === 200) {
        try {
          const parsed = JSON.parse(r.body);
          const user = parsed?.body?.data?.user;
          if (user?.isBanned) {
            return {
              isBan: true,
              reason: "API flag: user.isBanned=true",
              detail: r.body.substring(0, 500),
            };
          }
          if (user?.isLimitExceeded) {
            return {
              isBan: true,
              reason: "API flag: user.isLimitExceeded=true",
              detail: r.body.substring(0, 500),
            };
          }
        } catch {
          // not JSON
        }
      }
    }

    // HTTP 429 is always rate limit
    for (const r of capturedResponses) {
      if (r.status === 429) {
        return {
          isBan: true,
          reason: "HTTP 429 Too Many Requests",
          detail: (r.body || "").substring(0, 500),
        };
      }
    }

    // DataDome HTML challenge detection (403 with dd= script)
    for (const r of capturedResponses) {
      if (r.status === 403) {
        const bodyLower = (r.body || "").toLowerCase();
        if (bodyLower.includes("datadome") || bodyLower.includes("dd=")) {
          return {
            isBan: true,
            reason: "HTTP 403 DataDome challenge",
            detail: (r.body || "").substring(0, 500),
          };
        }
      }
    }

    // Non-ban errors (e.g. property not found, invalid reference)
    const errorResponse = capturedResponses.find((r) => r.status >= 400);
    if (errorResponse) {
      return {
        isBan: false,
        reason: `HTTP ${errorResponse.status} ${errorResponse.statusText}`,
        detail: (errorResponse.body || "").substring(0, 500),
      };
    }

    return null;
  };

  return { getResponses, findValuationResponse, analyzeForBan };
})();
