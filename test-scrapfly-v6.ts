/**
 * Test Scrapfly v6: CORRECT FULL FLOW
 *
 * Fixes from previous attempts:
 * - XPath selectors (not :has-text which is Playwright-only)
 * - wait_for_selector instead of fixed waits for SPA transitions
 * - Direct URL to skip search form step
 * - 25s budget
 *
 * Usage:
 *   SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v6.ts
 */

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const REF_CATASTRAL = "6918614VK3761H0005WO";
const EMAIL = "sergiop.pias@gmail.com";

async function test() {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) {
    console.error("Usage: SCRAPFLY_API_KEY=your-key npx tsx test-scrapfly-v6.ts");
    process.exit(1);
  }

  console.log("\n=== TEST SCRAPFLY v6: DIRECT URL + FULL FLOW ===\n");
  console.log(`Ref: ${REF_CATASTRAL} | Email: ${EMAIL}\n`);

  const targetUrl = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${REF_CATASTRAL}`;

  // Budget: 25s total
  // wait 2s + cookies 1s + wait_for Continuar 5s + click + wait_for radio 5s
  // + click + wait_for email 3s + fill + click checkbox + click submit + wait results 5s
  // ≈ 22s
  const scenario = JSON.stringify([
    // 1. Wait for page + accept cookies
    { "wait": 2000 },
    { "click": { "selector": "#didomi-notice-agree-button", "ignore_if_not_visible": true, "timeout": 2000 } },

    // 2. Wait for "Continuar" button to appear (SPA render)
    { "wait_for_selector": { "selector": "//button[contains(., 'Continuar')]", "state": "visible", "timeout": 6000 } },

    // 3. Click "Continuar" (XPath for text match)
    { "click": { "selector": "//button[contains(., 'Continuar')]" } },

    // 4. Wait for interests radio buttons to appear
    { "wait_for_selector": { "selector": "//label[contains(., 'informando')]", "state": "visible", "timeout": 6000 } },

    // 5. Click "Solo me estoy informando"
    { "click": { "selector": "//label[contains(., 'informando')]" } },

    // 6. Wait for email field to appear
    { "wait_for_selector": { "selector": "#email", "state": "visible", "timeout": 4000 } },

    // 7. Fill email
    { "fill": { "selector": "#email", "value": EMAIL } },
    { "wait": 500 },

    // 8. Click privacy checkbox
    { "click": { "selector": "input[name='privacy']" } },
    { "wait": 500 },

    // 9. Click "Ver valoración" (triggers reCAPTCHA + generate-valuation API)
    { "click": { "selector": "//button[contains(., 'valoración')]" } },

    // 10. Wait for reCAPTCHA to execute + API call + results render
    { "wait": 10000 },
  ]);

  const scenarioB64 = Buffer.from(scenario).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  console.log(`Scenario: ${scenario.length} chars JSON, ${scenarioB64.length} chars b64`);

  const params = new URLSearchParams({
    key: apiKey,
    url: targetUrl,
    asp: "true",
    render_js: "true",
    country: "es",
    js_scenario: scenarioB64,
    rendering_wait: "1000",
    "headers[Accept-Language]": "es-ES,es;q=0.9",
  });

  console.log("Flow: direct URL → Continuar → radio → email → privacy → Ver valoración\n");

  try {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = await res.json() as any;

    console.log(`HTTP: ${res.status}`);
    console.log(`Success: ${data.result?.success}`);
    console.log(`Status: ${data.result?.status_code}`);
    console.log(`URL final: ${data.result?.url || "N/A"}`);

    const content = data.result?.content || "";
    const titleMatch = content.match(/<title>(.*?)<\/title>/);
    if (titleMatch) console.log(`Title: ${titleMatch[1]}`);

    // Scenario execution details
    const scenarioLog = data.result?.browser_data?.js_scenario;
    if (scenarioLog) {
      console.log(`\nScenario: ${scenarioLog.executed}/${scenarioLog.steps?.length || '?'} steps, ${scenarioLog.duration}s`);
      for (const step of scenarioLog.steps || []) {
        const s = step.success ? "OK" : "FAIL";
        const selector = step.config?.selector || "";
        const config = step.config && !step.config.selector
          ? JSON.stringify(step.config).substring(0, 80)
          : "";
        console.log(`  [${s}] ${step.action} ${selector}${config} (${step.duration}s)`);
      }
    }

    if (data.result?.success) {
      console.log(`\nHTML: ${content.length} chars`);

      // Look for prices
      const prices = content.match(/\d{1,3}(?:\.\d{3})+\s*€/g);
      if (prices?.length) {
        console.log(`\nPRECIOS: ${prices.slice(0, 10).join(", ")}`);
      }

      // Key text checks
      for (const kw of ["precio de venta", "precio de alquiler", "€/m²", "Continuar", "informando", "Ver valoración"]) {
        if (content.toLowerCase().includes(kw.toLowerCase())) {
          console.log(`  Found: "${kw}"`);
        }
      }

      // XHR calls
      const xhrs = data.result?.browser_data?.xhr_call || [];
      console.log(`\nXHR calls: ${xhrs.length}`);

      const relevant = xhrs.filter((x: any) => {
        const url = x.url || "";
        return url.includes("valuation") || url.includes("vendorlead") || url.includes("generate") || url.includes("recaptcha");
      });

      if (relevant.length) {
        console.log(`\n=== RELEVANT XHR (${relevant.length}) ===`);
        for (const xhr of relevant) {
          const url = (xhr.url || "").replace("https://www.idealista.com", "");
          const status = xhr.response?.status || xhr.status || "?";
          console.log(`\n  ${xhr.method || "GET"} ${status} ${url.substring(0, 120)}`);

          const respBody = xhr.response?.body || xhr.body || "";
          if (respBody && typeof respBody === "string" && respBody.length < 3000) {
            try {
              const parsed = JSON.parse(respBody);
              if (parsed.data || parsed.result || parsed.uuid) {
                console.log(`     Response: ${JSON.stringify(parsed).substring(0, 500)}`);
              }
            } catch {
              if (respBody.length > 10) {
                console.log(`     Response: ${respBody.substring(0, 200)}`);
              }
            }
          }
        }
      }

      const fs = await import("fs");
      fs.writeFileSync("test-scrapfly-v6-result.html", content);
      fs.writeFileSync("test-scrapfly-v6-xhr.json", JSON.stringify(xhrs, null, 2));
      console.log("\nFiles: test-scrapfly-v6-result.html, test-scrapfly-v6-xhr.json");
    } else {
      console.log("\nFAILED");
      const err = data.result?.error || data;
      console.log(JSON.stringify(err, null, 2).substring(0, 2000));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
