import { Browser } from "playwright";
import { PropertyRow } from "../types";

const IDEALISTA_URL = "https://www.idealista.com/valoracion-de-inmuebles/";
const TIMEOUT = 30000;

export async function scrapeIdealista(
  browser: Browser,
  row: PropertyRow
): Promise<string> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(IDEALISTA_URL, { waitUntil: "networkidle", timeout: TIMEOUT });

    // Accept cookies if dialog appears
    const cookieBtn = page.locator(
      'button:has-text("Aceptar"), button:has-text("Accept"), #didomi-notice-agree-button'
    );
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.first().click();
      await page.waitForTimeout(1000);
    }

    const input = row.refCatastral || `${row.calle}, ${row.poblacion} ${row.cp}`;

    // Try to find the search/reference input - generic selectors, refined later
    const searchInput = page.locator(
      'input[name*="catast"], input[name*="address"], input[name*="search"], input[placeholder*="catastral"], input[placeholder*="dirección"], input[type="search"], input.search-input, #search-input, #cadastral-ref'
    ).first();

    await searchInput.waitFor({ state: "visible", timeout: TIMEOUT });
    await searchInput.fill(input);
    await page.waitForTimeout(500);

    // Try to submit - look for submit/search button
    const submitBtn = page.locator(
      'button[type="submit"], button:has-text("Valorar"), button:has-text("Buscar"), input[type="submit"], .submit-btn, .search-btn'
    ).first();

    await submitBtn.click();

    // Wait for results to load
    await page.waitForTimeout(5000);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT }).catch(() => {});

    const html = await page.content();
    return html;
  } finally {
    await context.close();
  }
}
