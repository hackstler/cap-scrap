/**
 * Test Scrapfly v3: correct form interaction
 *
 * The form has 2 modes: "Dirección completa" (default) and "Ref. catastral"
 * We need to: click "Ref. catastral" tab → fill input → click "Valorar gratis"
 *
 * Usage:
 *   SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v3.ts
 */

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const REF_CATASTRAL = "6918614VK3761H0005WO";

async function test() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) {
    console.error("Usage: SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v3.ts");
    process.exit(1);
  }

  console.log("\n=== TEST SCRAPFLY v3: REF CATASTRAL FORM ===\n");
  console.log(`Ref: ${REF_CATASTRAL}\n`);

  const scenario = JSON.stringify([
    // Wait for page to load
    { "wait": 3000 },
    // Accept cookies
    { "click": { "selector": "#didomi-notice-agree-button", "ignore_if_not_visible": true, "timeout": 3000 } },
    { "wait": 1000 },
    // Click "Ref. catastral" tab button (it's the second button in search-type-buttons-container)
    { "click": { "selector": ".search-type-buttons-container button.right" } },
    { "wait": 1500 },
    // Fill the ref catastral in the search input
    { "fill": { "selector": "#vendorlead-search-input", "value": REF_CATASTRAL } },
    { "wait": 1500 },
    // Click "Valorar gratis" button
    { "click": { "selector": "[data-collision-id='valuate-property-button']" } },
    // Wait for navigation to results page
    { "wait_for_navigation": { "timeout": 10000 } },
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
    rendering_wait: "3000",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
  });

  console.log("Scenario: click 'Ref. catastral' → fill → click 'Valorar gratis'\n");

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`Scrapfly HTTP: ${res.status}`);
    console.log(`Result status: ${data.result?.status_code || "N/A"}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`URL final: ${data.result?.url || "N/A"}`);

    // Show scenario log if available
    if (data.result?.browser_data?.js_scenario) {
      console.log("\nScenario log:");
      const scenarioResult = data.result.browser_data.js_scenario;
      console.log(JSON.stringify(scenarioResult, null, 2).substring(0, 2000));
    }

    if (data.result?.success) {
      const content = data.result.content || "";
      console.log(`\nContent: ${content.length} chars`);

      const titleMatch = content.match(/<title>(.*?)<\/title>/);
      if (titleMatch) console.log(`Título: ${titleMatch[1]}`);

      // Prices
      const priceMatch = content.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€/g);
      if (priceMatch && priceMatch.length > 0) {
        console.log(`\n🎉 PRECIOS: ${priceMatch.slice(0, 10).join(", ")}`);
      } else {
        console.log("\n❌ No se encontraron precios");
      }

      // €/m²
      const m2Match = content.match(/€\/m²|€\s*\/\s*m/gi);
      if (m2Match) console.log(`✅ Precio por m²: encontrado`);

      // Valuation keywords
      if (content.includes("full-address") || content.includes("property-location")) {
        console.log("✅ URL de valoración en contenido");
      }

      // Block check
      if (content.includes("uso indebido")) console.log("❌ Bloqueado");
      if (content.includes("captcha-delivery.com")) console.log("❌ CAPTCHA");

      // Save
      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-v3-result.html", content);
      console.log("\nHTML guardado: test-scrapfly-v3-result.html");

      // Show URL if it navigated
      if (content.includes("valoracion") || data.result?.url?.includes("full-address")) {
        console.log("\n✅ Parece que navegó a la página de resultados");
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
