import { chromium } from "patchright";

const REFS = [
  "6918614VK3761H0005WO",
  "6697111VK4769F0021AA",
];

async function testDirectUrl() {
  console.log("\n=== TEST: PATCHRIGHT + URL DIRECTA IDEALISTA ===\n");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });

  const page = await context.newPage();

  try {
    // Step 1: Warm up — visit homepage to get datadome cookie
    console.log("1. Visitando homepage para warm-up...");
    await page.goto("https://www.idealista.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    console.log("   Título:", await page.title());

    // Accept cookies
    const cookieBtn = page.locator('#didomi-notice-agree-button, button:has-text("Aceptar")');
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.first().click();
      console.log("   Cookies aceptadas");
      await page.waitForTimeout(1000);
    }

    // Check DataDome status
    const hasCaptcha = await page
      .locator('iframe[src*="captcha-delivery"]')
      .count();
    const content = await page.content();
    const hasDataDomeBlock = content.includes("captcha-delivery.com") && !(await page.locator("form").count());

    if (hasCaptcha > 0 || hasDataDomeBlock) {
      console.log("\n   ⚠️  DataDome CAPTCHA en homepage!");
      console.log("   Resuelve el CAPTCHA manualmente en la ventana del browser.");
      console.log("   Esperando 30 segundos...\n");
      await page.waitForTimeout(30000);
    } else {
      console.log("   ✅ Homepage cargada sin CAPTCHA");
    }

    // Show cookies
    const cookies = await context.cookies();
    const dd = cookies.find((c) => c.name === "datadome");
    console.log(`\n2. Cookies: ${cookies.length} total`);
    if (dd) {
      console.log(`   ✅ datadome: ${dd.value.substring(0, 40)}...`);
    } else {
      console.log("   ⚠️  No datadome cookie");
    }

    // Step 2: Navigate directly to the valuation URLs
    for (let i = 0; i < REFS.length; i++) {
      const ref = REFS[i];
      const url = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${ref}`;

      console.log(`\n${3 + i}. Ref: ${ref}`);
      console.log(`   URL: ${url}`);

      // Human-like delay between requests
      if (i > 0) {
        const delay = 3000 + Math.random() * 3000;
        console.log(`   Esperando ${Math.round(delay)}ms...`);
        await page.waitForTimeout(delay);
      }

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      // Check for CAPTCHA
      const captchaCount = await page
        .locator('iframe[src*="captcha-delivery"]')
        .count();

      if (captchaCount > 0) {
        console.log("   ⚠️  CAPTCHA! Resuelve manualmente (30s)...");
        await page.waitForTimeout(30000);
      }

      console.log("   Título:", await page.title());
      console.log("   URL final:", page.url());

      // Screenshot
      const screenshotPath = `test-idealista-ref${i + 1}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`   Screenshot: ${screenshotPath}`);

      // Check page content for valuation data
      const html = await page.content();
      console.log(`   HTML size: ${html.length} chars`);

      // Quick check for price indicators
      const priceMatch = html.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?\s*€/g);
      if (priceMatch && priceMatch.length > 0) {
        console.log(`   ✅ PRECIOS ENCONTRADOS: ${priceMatch.slice(0, 5).join(", ")}`);
      } else {
        console.log("   ❌ No se encontraron precios en el HTML");
      }

      // Check for error messages
      if (html.includes("captcha-delivery.com")) {
        console.log("   ❌ DataDome CAPTCHA en la página");
      }
      if (html.includes("error") || html.includes("Error")) {
        const errorSnippet = html.match(/(?:class="[^"]*error[^"]*"|Error[^<]{0,100})/i);
        if (errorSnippet) {
          console.log(`   ⚠️  Posible error: ${errorSnippet[0].substring(0, 80)}`);
        }
      }
    }

    console.log("\n\nBrowser abierto 120s para inspección manual. Ctrl+C para cerrar.\n");
    await page.waitForTimeout(120000);
  } catch (err) {
    console.error("\nERROR:", err);
    await page.screenshot({ path: "test-patchright-error.png", fullPage: true });
  } finally {
    await browser.close();
  }
}

testDirectUrl();
