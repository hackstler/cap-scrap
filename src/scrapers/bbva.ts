import { Browser } from "patchright";
import { PropertyRow, SheetConfig } from "../types";

const BBVA_URL =
  "https://web.bbva.es/us/prospects.html?v=33.3.10#housing-search";
const TIMEOUT = 30000;

export async function scrapeBbva(
  browser: Browser,
  row: PropertyRow,
  config: SheetConfig
): Promise<string> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(BBVA_URL, { waitUntil: "networkidle", timeout: TIMEOUT });

    // Accept cookies if dialog appears
    const cookieBtn = page.locator(
      'button:has-text("Aceptar"), button:has-text("Accept"), #cookies-accept, .cookies-accept'
    );
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.first().click();
      await page.waitForTimeout(1000);
    }

    const refInput = row.refCatastral || `${row.calle}, ${row.poblacion} ${row.cp}`;

    // Fill reference catastral / address - generic selectors, refined later
    const addressInput = page.locator(
      'input[name*="catast"], input[name*="address"], input[name*="search"], input[placeholder*="catastral"], input[placeholder*="dirección"], input[type="search"], #address-input, #cadastral-input'
    ).first();

    await addressInput.waitFor({ state: "visible", timeout: TIMEOUT });
    await addressInput.fill(refInput);
    await page.waitForTimeout(500);

    // Fill DNI if field exists
    const dniInput = page.locator(
      'input[name*="dni"], input[name*="nif"], input[name*="documento"], input[placeholder*="DNI"], input[placeholder*="NIF"], #dni-input'
    ).first();

    if (await dniInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dniInput.fill(config.dni);
      await page.waitForTimeout(300);
    }

    // Fill email if field exists
    const emailInput = page.locator(
      'input[name*="email"], input[name*="mail"], input[type="email"], input[placeholder*="email"], input[placeholder*="correo"], #email-input'
    ).first();

    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(config.gmail);
      await page.waitForTimeout(300);
    }

    // Submit form
    const submitBtn = page.locator(
      'button[type="submit"], button:has-text("Valorar"), button:has-text("Buscar"), button:has-text("Calcular"), input[type="submit"], .submit-btn, .search-btn'
    ).first();

    await submitBtn.click();

    // Wait for valuation results
    await page.waitForTimeout(5000);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT }).catch(() => {});

    const html = await page.content();
    return html;
  } finally {
    await context.close();
  }
}
