/**
 * Test Scrapfly v5: FULL FLOW (optimized for 30s budget)
 *
 * Usage:
 *   SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v5.ts
 */

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const REF_CATASTRAL = "6918614VK3761H0005WO";
const EMAIL = "sergiop.pias@gmail.com";

async function test() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) {
    console.error("Usage: SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v5.ts");
    process.exit(1);
  }

  console.log("\n=== TEST SCRAPFLY v5: FULL VALUATION FLOW ===\n");
  console.log(`Ref: ${REF_CATASTRAL} | Email: ${EMAIL}\n`);

  // Budget breakdown (max 30s):
  // rendering_wait: 3s
  // 6 clicks × 1.5s = 9s
  // 2 fills × 0.5s = 1s
  // waits: ~14s
  // Total: ~27s
  const scenario = JSON.stringify([
    // Initial load (2s)
    { "wait": 2000 },
    // Cookies
    { "click": { "selector": "#didomi-notice-agree-button", "ignore_if_not_visible": true, "timeout": 2000 } },

    // STEP 1: Ref catastral
    { "click": { "selector": ".search-type-buttons-container button.right" } },
    { "wait": 500 },
    { "fill": { "selector": "#vendorlead-search-input", "value": REF_CATASTRAL } },
    { "wait": 500 },
    { "click": { "selector": "[data-collision-id='valuate-property-button']" } },
    // Wait for interests page to load (replacing wait_for_navigation)
    { "wait": 4000 },

    // STEP 2: "Solo te estás informando"
    { "click": { "selector": "label:has-text('Solo te estás informando')" } },
    { "wait": 1000 },

    // STEP 3: Email + privacy + submit
    { "fill": { "selector": "input[type='email']", "value": EMAIL } },
    { "wait": 500 },
    { "click": { "selector": "input[type='checkbox']" } },
    { "wait": 500 },
    { "click": { "selector": "button:has-text('Ver valoración')" } },
    // Wait for results
    { "wait": 3000 },
  ]);

  const scenarioB64 = Buffer.from(scenario).toString("base64");

  const params = new URLSearchParams({
    key: apiKey,
    url: "https://www.idealista.com/valoracion-de-inmuebles/",
    asp: "true",
    render_js: "true",
    country: "es",
    js_scenario: scenarioB64,
    rendering_wait: "3000",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
  });

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`HTTP: ${res.status}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`URL final: ${data.result?.url || "N/A"}`);

    const scenarioLog = data.result?.browser_data?.js_scenario;
    if (scenarioLog) {
      console.log(`\nScenario: ${scenarioLog.executed} steps, ${scenarioLog.duration}s`);
      for (const step of scenarioLog.steps || []) {
        const s = step.success ? "✅" : "❌";
        console.log(`  ${s} ${step.action} ${step.config?.selector || step.config || ""} (${step.duration}s)`);
      }
    }

    if (data.result?.success) {
      const content = data.result.content || "";
      console.log(`\nHTML: ${content.length} chars`);

      // Prices
      const prices = content.match(/\d{1,3}(?:\.\d{3})+\s*€/g);
      if (prices?.length) {
        console.log(`\n🎉 PRECIOS: ${prices.slice(0, 10).join(", ")}`);
      } else {
        console.log("\n❌ No prices found in HTML");
      }

      // Key text
      for (const kw of ["precio de venta", "precio de alquiler", "€/m²"]) {
        if (content.toLowerCase().includes(kw)) console.log(`✅ "${kw}"`);
      }

      // XHR calls
      const xhrs = data.result?.browser_data?.xhr_call || [];
      const relevant = xhrs.filter((x: any) =>
        (x.url || "").includes("valuation") || (x.url || "").includes("vendorlead")
      );
      if (relevant.length) {
        console.log(`\n=== RELEVANT XHR (${relevant.length}) ===`);
        for (const xhr of relevant) {
          console.log(`\n🔥 ${xhr.method || "GET"} ${xhr.url}`);
          console.log(`   Status: ${xhr.status}`);
          if (xhr.body) {
            const body = typeof xhr.body === "string" ? xhr.body : JSON.stringify(xhr.body);
            console.log(`   Body: ${body.substring(0, 2000)}`);
          }
        }
      }

      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-v5-result.html", content);
      fs.writeFileSync("test-scrapfly-v5-xhr.json", JSON.stringify(xhrs, null, 2));
      console.log("\nFiles: test-scrapfly-v5-result.html, test-scrapfly-v5-xhr.json");
    } else {
      console.log("\n❌ Failed");
      console.log(JSON.stringify(data.result?.error || data, null, 2).substring(0, 2000));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
