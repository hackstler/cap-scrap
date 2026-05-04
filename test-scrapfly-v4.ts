/**
 * Test Scrapfly v4: optimized scenario + capture XHR data
 *
 * Key changes:
 * - Reduced waits to stay within 25s scenario budget
 * - Added rendering_wait AFTER scenario for SPA to render
 * - Capture browser_data (XHR calls) where the actual valuation JSON lives
 *
 * Usage:
 *   SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v4.ts
 */

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const REF_CATASTRAL = "6918614VK3761H0005WO";

async function test() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) {
    console.error("Usage: SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v4.ts");
    process.exit(1);
  }

  console.log("\n=== TEST SCRAPFLY v4: OPTIMIZED + XHR CAPTURE ===\n");
  console.log(`Ref: ${REF_CATASTRAL}\n`);

  // Shorter waits to leave budget for the SPA to render after navigation
  const scenario = JSON.stringify([
    { "wait": 2000 },
    { "click": { "selector": "#didomi-notice-agree-button", "ignore_if_not_visible": true, "timeout": 2000 } },
    { "wait": 500 },
    // Switch to "Ref. catastral" mode
    { "click": { "selector": ".search-type-buttons-container button.right" } },
    { "wait": 800 },
    // Fill ref catastral
    { "fill": { "selector": "#vendorlead-search-input", "value": REF_CATASTRAL } },
    { "wait": 800 },
    // Click "Valorar gratis"
    { "click": { "selector": "[data-collision-id='valuate-property-button']" } },
    // Wait for navigation
    { "wait_for_navigation": { "timeout": 8000 } },
    // Let SPA render results
    { "wait": 5000 },
  ]);

  const scenarioB64 = Buffer.from(scenario).toString("base64");

  const params = new URLSearchParams({
    key: apiKey,
    url: "https://www.idealista.com/valoracion-de-inmuebles/",
    asp: "true",
    render_js: "true",
    country: "es",
    js_scenario: scenarioB64,
    // Extra rendering time AFTER scenario completes
    rendering_wait: "5000",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
  });

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`HTTP: ${res.status}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`URL final: ${data.result?.url || "N/A"}`);

    // Scenario execution summary
    const scenarioLog = data.result?.browser_data?.js_scenario;
    if (scenarioLog) {
      console.log(`Scenario: ${scenarioLog.executed} steps, ${scenarioLog.duration}s`);
      const failed = scenarioLog.steps?.filter((s: any) => !s.success);
      if (failed?.length) {
        console.log("Failed steps:", JSON.stringify(failed, null, 2));
      }
    }

    if (data.result?.success) {
      const content = data.result.content || "";
      console.log(`\nHTML: ${content.length} chars`);

      // Check for prices in rendered HTML
      const priceMatch = content.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€/g);
      if (priceMatch && priceMatch.length > 0) {
        console.log(`\n🎉 PRECIOS EN HTML: ${priceMatch.slice(0, 10).join(", ")}`);
      } else {
        console.log("\n❌ No hay precios en el HTML renderizado");
      }

      // Check for valuation-related elements
      const valuationKeywords = ["precio-venta", "precio-alquiler", "price", "valuation", "€/m"];
      for (const kw of valuationKeywords) {
        if (content.toLowerCase().includes(kw)) {
          console.log(`  ✅ Keyword: "${kw}"`);
        }
      }

      // === CRITICAL: Check XHR/network requests ===
      const browserData = data.result?.browser_data;

      if (browserData?.xhr_call) {
        console.log(`\n=== XHR CALLS: ${browserData.xhr_call.length} ===`);
        for (const xhr of browserData.xhr_call) {
          const url = xhr.url || "";
          const status = xhr.status || "";
          // Show all XHRs but highlight valuation-related ones
          const isRelevant =
            url.includes("valuator") ||
            url.includes("valuation") ||
            url.includes("property") ||
            url.includes("price") ||
            url.includes("vendorlead");

          if (isRelevant) {
            console.log(`\n🔥 RELEVANT XHR:`);
            console.log(`   URL: ${url}`);
            console.log(`   Status: ${status}`);
            console.log(`   Method: ${xhr.method || "GET"}`);
            if (xhr.body) {
              const bodyStr = typeof xhr.body === "string" ? xhr.body : JSON.stringify(xhr.body);
              console.log(`   Body (first 2000): ${bodyStr.substring(0, 2000)}`);
            }
          } else {
            console.log(`   ${status} ${url.substring(0, 100)}`);
          }
        }
      } else {
        console.log("\n⚠️  No XHR data captured");
      }

      // Also check websocket data
      if (browserData?.websocket) {
        console.log(`\nWebSocket messages: ${browserData.websocket.length}`);
      }

      // Save HTML
      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-v4-result.html", content);
      console.log("\nHTML: test-scrapfly-v4-result.html");

      // Save full browser_data for inspection
      if (browserData) {
        fs.writeFileSync(
          "test-scrapfly-v4-browser-data.json",
          JSON.stringify(browserData, null, 2)
        );
        console.log("Browser data: test-scrapfly-v4-browser-data.json");
      }
    } else {
      console.log("\n❌ Failed");
      console.log(JSON.stringify(data.result?.error || data, null, 2).substring(0, 2000));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
