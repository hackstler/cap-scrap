// content/price-extractor.js
// Responsibility: Extracts valuation prices from the Idealista DOM
// after the valuation results have loaded.

var PriceExtractor = (function () {
  "use strict";

  var VALUATION_SECTION_SELECTOR = ".valuation-ranges";
  var PRICE_RANGE_SELECTOR = ".valuation-ranges__range p";
  var PRICE_PER_METER_SELECTOR = '[class*="price-per-meter"], [class*="m2"]';
  var PRICE_PER_M2_REGEX = /(\d[\d.]*)\s*€\/m²/;

  /**
   * Waits until BOTH "venta" and "alquiler" sections appear in the DOM.
   * Uses MutationObserver to avoid polling.
   * If timeout is reached, resolves true if at least one section exists.
   */
  function waitForBothValuationSections(timeoutMs) {
    return new Promise(function (resolve) {
      function areBothSectionsPresent() {
        var sections = document.querySelectorAll(VALUATION_SECTION_SELECTOR);
        var hasVenta = false;
        var hasAlquiler = false;

        for (var i = 0; i < sections.length; i++) {
          var text = sections[i].textContent.toLowerCase();
          if (text.includes("venta")) hasVenta = true;
          if (text.includes("alquiler")) hasAlquiler = true;
        }

        return hasVenta && hasAlquiler;
      }

      if (areBothSectionsPresent()) return resolve(true);

      var observer = new MutationObserver(function () {
        if (areBothSectionsPresent()) {
          observer.disconnect();
          resolve(true);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(function () {
        observer.disconnect();
        // Resolve true if at least some sections are present (partial data)
        resolve(document.querySelectorAll(VALUATION_SECTION_SELECTOR).length > 0);
      }, timeoutMs);
    });
  }

  /**
   * Extracts prices from a single valuation section (.valuation-ranges).
   * Returns an object with min and max price strings.
   */
  function extractPricesFromSection(sectionElement) {
    var priceElements = sectionElement.querySelectorAll(PRICE_RANGE_SELECTOR);
    var priceTexts = Array.from(priceElements)
      .map(function (p) { return p.textContent.trim(); })
      .filter(function (t) { return t.includes("€"); });

    return {
      min: priceTexts.length >= 1 ? priceTexts[0] : "",
      max: priceTexts.length >= 2 ? priceTexts[1] : "",
    };
  }

  /**
   * Attempts to extract venta/alquiler prices by section title.
   */
  function extractPricesBySectionTitle() {
    var sections = document.querySelectorAll(VALUATION_SECTION_SELECTOR);
    var ventaPrices = { min: "", max: "" };
    var alquilerPrices = { min: "", max: "" };

    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var title = (section.querySelector("p")?.textContent?.trim() || "").toLowerCase();
      var prices = extractPricesFromSection(section);

      if (title.includes("venta") && prices.min) {
        ventaPrices = prices;
      } else if (title.includes("alquiler") && prices.min) {
        alquilerPrices = prices;
      }
    }

    return { venta: ventaPrices, alquiler: alquilerPrices };
  }

  /**
   * Fallback extraction: grabs all price elements regardless of section.
   */
  function extractPricesByFallback(log) {
    var allPriceElements = document.querySelectorAll(PRICE_RANGE_SELECTOR);
    var allTexts = Array.from(allPriceElements)
      .map(function (p) { return p.textContent.trim(); })
      .filter(function (t) { return t.includes("€"); });

    log("7b", "Fallback: encontrados " + allTexts.length + " precios: " + allTexts.join(", "));

    var venta = { min: "", max: "" };
    var alquiler = { min: "", max: "" };

    if (allTexts.length >= 4) {
      venta = { min: allTexts[0], max: allTexts[1] };
      alquiler = { min: allTexts[2], max: allTexts[3] };
    } else if (allTexts.length >= 2) {
      venta = { min: allTexts[0], max: allTexts[1] };
    }

    return { venta: venta, alquiler: alquiler };
  }

  /**
   * Attempts to find a price-per-square-meter value on the page.
   */
  function extractPricePerSquareMeter() {
    var m2Element = document.querySelector(PRICE_PER_METER_SELECTOR);
    if (m2Element) {
      return m2Element.textContent.trim();
    }

    var pageText = document.body.innerText;
    var match = pageText.match(PRICE_PER_M2_REGEX);
    return match ? match[0] : "N/A";
  }

  function formatPriceRange(prices) {
    if (prices.min && prices.max) {
      return prices.min + " - " + prices.max;
    }
    return "N/A";
  }

  /**
   * Main extraction function. Tries section-based extraction first,
   * falls back to grabbing all prices from the page.
   */
  function extractAllPrices(log) {
    var result = extractPricesBySectionTitle();

    if (!result.venta.min && !result.alquiler.min) {
      result = extractPricesByFallback(log);
    }

    var precioM2 = extractPricePerSquareMeter();

    return {
      valoracionVenta: formatPriceRange(result.venta),
      valoracionAlquiler: formatPriceRange(result.alquiler),
      precioM2: precioM2,
      raw: JSON.stringify({
        ventaMin: result.venta.min,
        ventaMax: result.venta.max,
        alquilerMin: result.alquiler.min,
        alquilerMax: result.alquiler.max,
        precioM2: precioM2,
      }),
    };
  }

  return {
    waitForBothValuationSections: waitForBothValuationSections,
    extractAllPrices: extractAllPrices,
  };
})();
