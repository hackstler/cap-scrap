/**
 * Test Scrapfly with JavaScript Scenario to interact with Idealista's valuation form.
 *
 * Strategy: navigate to valoracion page → fill ref catastral → submit → capture result
 *
 * Usage:
 *   SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v2.ts
 */

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const REF_CATASTRAL = "6918614VK3761H0005WO";

async function testWithScenario() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) {
    console.error("ERROR: Set SCRAPFLY_API_KEY env var");
    process.exit(1);
  }

  console.log("\n=== TEST SCRAPFLY v2: JS SCENARIO ===\n");

  // JavaScript Scenario: interact with the form
  const scenario = JSON.stringify([
    // Wait for the page to fully load
    { "wait": 3000 },
    // Try to accept cookies
    { "click": { "selector": "#didomi-notice-agree-button", "ignore_if_not_visible": true, "timeout": 3000 } },
    { "wait": 1000 },
    // Fill the ref catastral in the search input
    { "fill": { "selector": "input[type='text']:visible, input[type='search']:visible, input:not([type]):visible", "value": REF_CATASTRAL } },
    { "wait": 1500 },
    // Click a suggestion if one appears
    { "click": { "selector": "[role='option'], .autocomplete-item, li[class*='suggest']", "ignore_if_not_visible": true, "timeout": 3000 } },
    { "wait": 1000 },
    // Submit
    { "click": { "selector": "button[type='submit'], button:has-text('Valorar'), button:has-text('Buscar')", "ignore_if_not_visible": true, "timeout": 3000 } },
    // Wait for navigation/results
    { "wait_for_navigation": { "timeout": 10000 } },
    { "wait": 3000 },
  ]);

  // Base64 encode the scenario
  const scenarioB64 = Buffer.from(scenario).toString("base64");

  const params = new URLSearchParams({
    key: apiKey,
    url: "https://www.idealista.com/valoracion-de-inmuebles/",
    asp: "true",
    render_js: "true",
    country: "es",
    js_scenario: scenarioB64,
    rendering_wait: "5000",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
  });

  console.log("Scenario: fill form → submit → wait for results");
  console.log(`Ref catastral: ${REF_CATASTRAL}\n`);

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`Scrapfly status: ${res.status}`);
    console.log(`Result status: ${data.result?.status_code || "N/A"}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`URL final: ${data.result?.url || "N/A"}`);

    if (data.result?.success) {
      const content = data.result.content || "";
      console.log(`Content size: ${content.length} chars`);

      // Check for prices
      const priceMatch = content.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€/g);
      if (priceMatch && priceMatch.length > 0) {
        console.log(`\n✅ PRECIOS: ${priceMatch.slice(0, 10).join(", ")}`);
      } else {
        console.log("\n❌ No se encontraron precios");
      }

      // Check title
      const titleMatch = content.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        console.log(`Título: ${titleMatch[1]}`);
      }

      // Check for valuation keywords
      const keywords = ["valoración", "€/m²", "precio", "estimado", "venta", "alquiler"];
      for (const kw of keywords) {
        if (content.toLowerCase().includes(kw.toLowerCase())) {
          console.log(`✅ Keyword found: "${kw}"`);
        }
      }

      // Save
      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-v2-result.html", content);
      console.log("\nHTML: test-scrapfly-v2-result.html");

      // Show snippet around prices or valuation content
      const idx = content.indexOf("valoración");
      if (idx > -1) {
        console.log("\n--- Snippet around 'valoración' ---");
        console.log(content.substring(Math.max(0, idx - 200), idx + 500));
      }
    } else {
      console.log("\n❌ Request failed");
      console.log(JSON.stringify(data.result?.error || data, null, 2).substring(0, 2000));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

// Also try: direct URL with rendering wait (maybe it just needs more time)
async function testDirectUrlWithWait() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) return;

  console.log("\n\n=== TEST SCRAPFLY v2b: URL DIRECTA + RENDERING WAIT ===\n");

  const targetUrl = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${REF_CATASTRAL}`;

  const params = new URLSearchParams({
    key: apiKey,
    url: targetUrl,
    asp: "true",
    render_js: "true",
    rendering_wait: "8000",
    country: "es",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
    "headers[Referer]": "https://www.idealista.com/valoracion-de-inmuebles/",
  });

  console.log(`URL: ${targetUrl}\n`);

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`Status: ${data.result?.status_code || res.status}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`URL final: ${data.result?.url || "N/A"}`);

    if (data.result?.success) {
      const content = data.result.content || "";
      console.log(`Content size: ${content.length} chars`);

      const titleMatch = content.match(/<title>(.*?)<\/title>/);
      if (titleMatch) console.log(`Título: ${titleMatch[1]}`);

      const priceMatch = content.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€/g);
      if (priceMatch && priceMatch.length > 0) {
        console.log(`✅ PRECIOS: ${priceMatch.slice(0, 10).join(", ")}`);
      }

      if (content.includes("uso indebido") || content.includes("ha bloqueado")) {
        console.log("❌ Página de bloqueo");
      }

      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-v2b-result.html", content);
      console.log("HTML: test-scrapfly-v2b-result.html");
    } else {
      console.log("❌ Failed");
      console.log(JSON.stringify(data.result?.error || data, null, 2).substring(0, 1000));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

async function main() {
  await testWithScenario();
  await testDirectUrlWithWait();
}

main();
