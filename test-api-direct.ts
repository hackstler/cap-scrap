import { chromium } from "patchright";

const REF_CATASTRAL = "6918614VK3761H0005WO";
const API_URL = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${REF_CATASTRAL}`;

async function testDirectApi() {
  console.log("\n=== TEST: API DIRECTA DE IDEALISTA ===\n");
  console.log(`Endpoint: ${API_URL}\n`);

  // Step 1: Use Patchright to get a valid datadome cookie
  console.log("1. Abriendo Patchright para obtener cookie datadome...");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });

  const page = await context.newPage();

  try {
    // Navigate to a lightweight Idealista page to get cookies set
    await page.goto("https://www.idealista.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("   Página cargada:", await page.title());
    await page.waitForTimeout(3000);

    // Check for DataDome on the main page
    const content = await page.content();
    const hasDataDome =
      content.includes("captcha-delivery.com") ||
      content.includes("DataDome");
    console.log(
      `   DataDome en main page: ${hasDataDome ? "⚠️  SÍ" : "✅ NO"}`
    );

    // Get all cookies
    const cookies = await context.cookies();
    const dataDomeCookie = cookies.find((c) => c.name === "datadome");

    console.log(`\n2. Cookies obtenidas: ${cookies.length} total`);
    for (const c of cookies) {
      console.log(
        `   - ${c.name} = ${c.value.substring(0, 40)}... (domain: ${c.domain})`
      );
    }

    if (!dataDomeCookie) {
      console.log("\n⚠️  No se encontró cookie datadome. Probando igualmente...");
    } else {
      console.log(
        `\n✅ Cookie datadome encontrada: ${dataDomeCookie.value.substring(0, 50)}...`
      );
    }

    // Step 2: Try making the API call using the browser's context (page.request)
    console.log("\n3. Haciendo request al endpoint API via browser context...");

    const response = await page.request.get(API_URL, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.idealista.com/valoracion-de-inmuebles/",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    console.log(`   Status: ${response.status()}`);
    console.log(
      `   Headers:`,
      JSON.stringify(Object.fromEntries(
        Object.entries(response.headers()).filter(([k]) =>
          ["content-type", "set-cookie", "x-datadome"].some((h) =>
            k.toLowerCase().includes(h)
          )
        )
      ))
    );

    const body = await response.text();
    console.log(`   Body (primeros 2000 chars):\n`);
    console.log(body.substring(0, 2000));

    if (response.status() === 200) {
      console.log("\n🎉 ¡FUNCIONA! El endpoint responde con datos.");
      try {
        const json = JSON.parse(body);
        console.log("\nJSON parseado:");
        console.log(JSON.stringify(json, null, 2).substring(0, 3000));
      } catch {
        console.log("(No es JSON válido)");
      }
    } else {
      console.log(
        `\n❌ Status ${response.status()}. DataDome sigue bloqueando.`
      );
    }

    // Step 3: Also try direct fetch with extracted cookies (without browser)
    console.log("\n\n4. Probando fetch() directo (sin browser) con las cookies...");

    const cookieHeader = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const directRes = await fetch(API_URL, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "es-ES,es;q=0.9",
        Cookie: cookieHeader,
        Referer: "https://www.idealista.com/valoracion-de-inmuebles/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    console.log(`   Status: ${directRes.status}`);
    const directBody = await directRes.text();
    console.log(`   Body (primeros 2000 chars):\n`);
    console.log(directBody.substring(0, 2000));

    if (directRes.status === 200) {
      console.log("\n🎉 ¡fetch() directo FUNCIONA!");
      try {
        const json = JSON.parse(directBody);
        console.log("\nJSON parseado:");
        console.log(JSON.stringify(json, null, 2).substring(0, 3000));
      } catch {
        console.log("(No es JSON válido)");
      }
    }

    // Step 4: If the API works, test a second ref catastral to confirm
    if (response.status() === 200) {
      console.log("\n5. Probando segunda ref catastral con misma sesión...");
      const secondRef = "6697111VK4769F0021AA";
      const secondUrl = `https://www.idealista.com/es/vendorleads/valuator/property-location/full-address?reference=${secondRef}`;

      const res2 = await page.request.get(secondUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.idealista.com/valoracion-de-inmuebles/",
        },
      });

      console.log(`   Status: ${res2.status()}`);
      const body2 = await res2.text();
      console.log(`   Body: ${body2.substring(0, 1000)}`);
    }

    console.log("\n\nBrowser abierto 60s para inspección. Ctrl+C para cerrar.\n");
    await page.waitForTimeout(60000);
  } catch (err) {
    console.error("\nERROR:", err);
    await page.screenshot({ path: "test-api-error.png", fullPage: true });
  } finally {
    await browser.close();
  }
}

testDirectApi();
