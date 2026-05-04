import { PropertyRow, IdealistaData } from "../types";

const SCRAPFLY_API = "https://api.scrapfly.io/scrape";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

interface ScrapflyXhr {
  url: string;
  method: string;
  response: { body: string; status: number };
}

/**
 * Build the JS scenario for the full Idealista valuation flow.
 * Steps: cookies → Continuar → radio "informando" → email → privacy → Ver valoración
 */
function buildScenario(email: string): string {
  return JSON.stringify([
    { "wait": 2000 },
    { "click": { "selector": "#didomi-notice-agree-button", "ignore_if_not_visible": true, "timeout": 2000 } },
    { "wait_for_selector": { "selector": "//button[contains(., 'Continuar')]", "state": "visible", "timeout": 6000 } },
    { "click": { "selector": "//button[contains(., 'Continuar')]" } },
    { "wait_for_selector": { "selector": "//label[contains(., 'informando')]", "state": "visible", "timeout": 6000 } },
    { "click": { "selector": "//label[contains(., 'informando')]" } },
    { "wait_for_selector": { "selector": "#email", "state": "visible", "timeout": 4000 } },
    { "fill": { "selector": "#email", "value": email } },
    { "wait": 500 },
    { "click": { "selector": "input[name='privacy']" } },
    { "wait": 500 },
    { "click": { "selector": "//button[contains(., 'valoración')]" } },
    { "wait": 10000 },
  ]);
}

function toUrlSafeBase64(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function formatPrice(value: string): string {
  const num = parseInt(value, 10);
  if (isNaN(num)) return value;
  return num.toLocaleString("es-ES") + " €";
}

/**
 * Call Scrapfly API and return the raw response.
 * Handles retries for intermittent DataDome 403 blocks.
 */
async function callScrapfly(
  refCatastral: string,
  email: string,
  apiKey: string
): Promise<any> {
  const targetUrl = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${refCatastral}`;
  const scenario = buildScenario(email);
  const scenarioB64 = toUrlSafeBase64(scenario);

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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${SCRAPFLY_API}?${params.toString()}`);
    const data = (await res.json()) as any;

    if (!data.result?.success) {
      const msg = data.result?.error?.message || data.message || `HTTP ${res.status}`;
      console.warn(`[Idealista] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw new Error(`Scrapfly failed after ${MAX_RETRIES} attempts: ${msg}`);
    }

    // Check for DataDome 403s on key API calls
    const xhrs: ScrapflyXhr[] = data.result?.browser_data?.xhr_call || [];
    const has403 = xhrs.some(
      (x) =>
        x.url?.includes("/vendorleads/valuator/") &&
        x.response?.status === 403
    );

    if (has403) {
      console.warn(`[Idealista] Attempt ${attempt}/${MAX_RETRIES}: DataDome blocked API calls (403)`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw new Error("DataDome blocked API calls after all retries");
    }

    return data;
  }

  throw new Error("Unreachable");
}

/**
 * Extract valuation data from the Scrapfly XHR captures.
 */
function extractValuation(data: any): IdealistaData {
  const xhrs: ScrapflyXhr[] = data.result?.browser_data?.xhr_call || [];

  // Find the valuations/{uuid}?language=es response
  const valuationXhr = xhrs.find(
    (x) => x.url?.includes("/vendorleads/valuations/") && x.url?.includes("language=")
  );

  if (!valuationXhr) {
    const generateXhr = xhrs.find((x) => x.url?.includes("/generate-valuation/"));
    if (!generateXhr) {
      throw new Error("Valuation not generated — reCAPTCHA may have failed");
    }
    throw new Error("generate-valuation called but valuation response not captured");
  }

  const body = valuationXhr.response?.body;
  if (!body) throw new Error("Empty valuation response");

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Invalid valuation JSON: ${body.substring(0, 200)}`);
  }

  // Response shape: { body: { data: { valuation, property } } }
  // or:             { data: { valuation, property } }
  const valData = parsed?.body?.data || parsed?.data;
  const valuation = valData?.valuation;
  const property = valData?.property;

  if (!valuation?.sale || !valuation?.rent) {
    throw new Error(`Incomplete valuation: ${JSON.stringify(valuation).substring(0, 200)}`);
  }

  const sale = valuation.sale;
  const rent = valuation.rent;
  const area = parseInt(property?.area, 10);

  return {
    valoracionVenta: `${formatPrice(sale.minPrice)} - ${formatPrice(sale.maxPrice)}`,
    valoracionAlquiler: `${formatPrice(rent.minPrice)} - ${formatPrice(rent.maxPrice)}`,
    precioM2:
      area > 0
        ? `${Math.round(parseInt(sale.averagePrice, 10) / area).toLocaleString("es-ES")} €/m²`
        : "N/A",
    raw: JSON.stringify({
      venta: { min: sale.minPrice, max: sale.maxPrice, media: sale.averagePrice },
      alquiler: { min: rent.minPrice, max: rent.maxPrice, media: rent.averagePrice },
      direccion: property?.simpleAddress,
      zona: property?.lastZone,
      m2: property?.area,
      fecha: valuation.valuationDate,
    }),
  };
}

/**
 * Scrape a single property valuation from Idealista via Scrapfly.
 * Returns structured valuation data (no Gemini needed).
 */
export async function scrapeIdealista(
  row: PropertyRow,
  email: string
): Promise<IdealistaData> {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  if (!apiKey) throw new Error("SCRAPFLY_API_KEY not set");

  const ref = row.refCatastral;
  if (!ref) throw new Error(`Row ${row.rowIndex}: sin referencia catastral`);

  console.log(`[Idealista] Scraping ref ${ref} via Scrapfly...`);

  const data = await callScrapfly(ref, email, apiKey);

  // Log scenario summary
  const scenarioLog = data.result?.browser_data?.js_scenario;
  if (scenarioLog) {
    const total = scenarioLog.steps?.length || 0;
    const failed = scenarioLog.steps?.filter((s: any) => !s.success) || [];
    console.log(
      `[Idealista] Scenario: ${scenarioLog.executed}/${total} steps, ${scenarioLog.duration}s`
    );
    if (failed.length) {
      for (const s of failed) {
        console.warn(`[Idealista]   FAIL: ${s.action} ${s.config?.selector || ""}`);
      }
    }
  }

  const result = extractValuation(data);
  console.log(`[Idealista] ${ref}: Venta ${result.valoracionVenta} | Alquiler ${result.valoracionAlquiler}`);
  return result;
}
