// content/price-extractor.js
// Responsibility: Extracts valuation prices from the intercepted Idealista
// API response (JSON) instead of scraping the DOM.
// Returns sale maxPrice and minPrice as plain numbers.

const PriceExtractor = (() => {
  "use strict";

  const POLL_INTERVAL_MS = 500;

  const waitForValuationApiResponse = (timeoutMs) =>
    new Promise((resolve) => {
      const existing = ApiInterceptor.findValuationResponse();
      if (existing) return resolve(existing);

      const intervalId = setInterval(() => {
        const found = ApiInterceptor.findValuationResponse();
        if (found) {
          clearInterval(intervalId);
          resolve(found);
        }
      }, POLL_INTERVAL_MS);

      setTimeout(() => {
        clearInterval(intervalId);
        resolve(null);
      }, timeoutMs);
    });

  const parsePrice = (value) => {
    if (!value) return null;
    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  };

  const extractPricesFromResponse = (apiData) => {
    const valuation = apiData?.body?.data?.valuation;
    if (!valuation?.sale) return null;

    const maxVenta = parsePrice(valuation.sale.maxPrice);
    const minVenta = parsePrice(valuation.sale.minPrice);

    if (maxVenta === null || minVenta === null) return null;

    return { maxVenta, minVenta };
  };

  return { waitForValuationApiResponse, extractPricesFromResponse };
})();
