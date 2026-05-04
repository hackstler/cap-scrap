/**
 * Test Scrapfly against Idealista's valuation endpoint.
 *
 * Usage:
 *   SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly.ts
 */

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const REF_CATASTRAL = "6918614VK3761H0005WO";
const TARGET_URL = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${REF_CATASTRAL}`;

async function testScrapfly() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) {
    console.error("ERROR: Set SCRAPFLY_API_KEY env var");
    console.error("Usage: SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly.ts");
    process.exit(1);
  }

  console.log("\n=== TEST SCRAPFLY vs IDEALISTA DATADOME ===\n");
  console.log(`Target: ${TARGET_URL}\n`);

  // Build Scrapfly request with Anti-Scraping Protection enabled
  const params = new URLSearchParams({
    key: apiKey,
    url: TARGET_URL,
    // Anti-bot bypass
    asp: "true",
    // Render JavaScript (in case the page needs it)
    render_js: "true",
    // Country: Spain (residential IP from Spain)
    country: "es",
    // Headers to look like a real browser
    "headers[Accept]": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
    "headers[Referer]": "https://www.idealista.com/valoracion-de-inmuebles/",
  });

  const url = `${SCRAPFLY_API}?${params.toString()}`;

  console.log("Sending request to Scrapfly...\n");

  try {
    const res = await fetch(url);
    const data = await res.json() as any;

    console.log(`Scrapfly status: ${res.status}`);
    console.log(`Result status: ${data.result?.status_code || "N/A"}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`Credits used: ${data.config?.cost || "N/A"}`);

    if (data.result?.success) {
      const content = data.result.content || "";
      console.log(`\nContent size: ${content.length} chars`);

      // Check for prices
      const priceMatch = content.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€/g);
      if (priceMatch && priceMatch.length > 0) {
        console.log(`\n✅ PRECIOS ENCONTRADOS: ${priceMatch.slice(0, 10).join(", ")}`);
      }

      // Check for valuation-specific content
      if (content.includes("valoración") || content.includes("valoracion") || content.includes("Valoración")) {
        console.log("✅ Contenido de valoración detectado");
      }

      // Check for block/captcha
      if (content.includes("captcha-delivery.com")) {
        console.log("❌ DataDome CAPTCHA en el contenido");
      }
      if (content.includes("uso indebido") || content.includes("bloqueado")) {
        console.log("❌ Página de bloqueo de Idealista");
      }

      // Save HTML for inspection
      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-result.html", content);
      console.log("\nHTML guardado en: test-scrapfly-result.html");

      // Show a snippet
      console.log("\n--- Primeros 1500 chars del HTML ---\n");
      console.log(content.substring(0, 1500));
    } else {
      console.log("\n❌ Request failed");
      console.log("Error:", JSON.stringify(data.result?.error || data.error, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

// Also test a simpler request first (just the homepage) to verify API key works
async function testHomepage() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) return;

  console.log("--- Quick test: Idealista homepage ---\n");

  const params = new URLSearchParams({
    key: apiKey,
    url: "https://www.idealista.com/",
    asp: "true",
    country: "es",
  });

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`Homepage status: ${data.result?.status_code || res.status}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`Credits: ${data.config?.cost || "N/A"}`);

    if (data.result?.success) {
      console.log("✅ Scrapfly puede acceder a idealista.com\n");
    } else {
      console.log("❌ Scrapfly no puede acceder a idealista.com");
      console.log("Error:", JSON.stringify(data.result?.error || data.error, null, 2));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

async function main() {
  await testHomepage();
  await testScrapfly();
}

main();
