import { chromium } from "playwright";

const REF_CATASTRAL_EJEMPLO = "6697111VK4769F0021AA";

async function testIdealista() {
  console.log("\n=== TEST IDEALISTA ===\n");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("Navegando a Idealista valoración...");
    await page.goto("https://www.idealista.com/valoracion-de-inmuebles/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("Página cargada. Título:", await page.title());
    console.log("URL actual:", page.url());

    // Esperar 5 segundos para ver qué se muestra
    await page.waitForTimeout(5000);

    // Captura de pantalla
    await page.screenshot({ path: "test-idealista.png", fullPage: true });
    console.log("Screenshot guardado: test-idealista.png");

    // Listar todos los inputs visibles
    const inputs = await page.locator("input:visible").all();
    console.log(`\nInputs visibles: ${inputs.length}`);
    for (const input of inputs) {
      const name = await input.getAttribute("name");
      const type = await input.getAttribute("type");
      const placeholder = await input.getAttribute("placeholder");
      const id = await input.getAttribute("id");
      console.log(`  - name="${name}" type="${type}" placeholder="${placeholder}" id="${id}"`);
    }

    // Listar botones visibles
    const buttons = await page.locator("button:visible").all();
    console.log(`\nBotones visibles: ${buttons.length}`);
    for (const btn of buttons) {
      const text = await btn.textContent();
      const type = await btn.getAttribute("type");
      console.log(`  - "${text?.trim()}" type="${type}"`);
    }

    console.log("\nNavegador abierto. Revisa la ventana manualmente.");
    console.log("Pulsa Ctrl+C para cerrar.\n");

    // Mantener abierto para inspección manual
    await page.waitForTimeout(120000);
  } catch (err) {
    console.error("Error:", err);
    await page.screenshot({ path: "test-idealista-error.png", fullPage: true });
    console.log("Screenshot de error guardado: test-idealista-error.png");
  } finally {
    await browser.close();
  }
}

async function testBbva() {
  console.log("\n=== TEST BBVA ===\n");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log("Navegando a BBVA Valora...");
    await page.goto(
      "https://web.bbva.es/us/prospects.html?v=33.3.10#housing-search",
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    console.log("Página cargada. Título:", await page.title());
    console.log("URL actual:", page.url());

    await page.waitForTimeout(5000);

    await page.screenshot({ path: "test-bbva.png", fullPage: true });
    console.log("Screenshot guardado: test-bbva.png");

    const inputs = await page.locator("input:visible").all();
    console.log(`\nInputs visibles: ${inputs.length}`);
    for (const input of inputs) {
      const name = await input.getAttribute("name");
      const type = await input.getAttribute("type");
      const placeholder = await input.getAttribute("placeholder");
      const id = await input.getAttribute("id");
      console.log(`  - name="${name}" type="${type}" placeholder="${placeholder}" id="${id}"`);
    }

    const buttons = await page.locator("button:visible").all();
    console.log(`\nBotones visibles: ${buttons.length}`);
    for (const btn of buttons) {
      const text = await btn.textContent();
      const type = await btn.getAttribute("type");
      console.log(`  - "${text?.trim()}" type="${type}"`);
    }

    console.log("\nNavegador abierto. Revisa la ventana manualmente.");
    console.log("Pulsa Ctrl+C para cerrar.\n");

    await page.waitForTimeout(120000);
  } catch (err) {
    console.error("Error:", err);
    await page.screenshot({ path: "test-bbva-error.png", fullPage: true });
    console.log("Screenshot de error guardado: test-bbva-error.png");
  } finally {
    await browser.close();
  }
}

const target = process.argv[2] || "idealista";

if (target === "idealista") {
  testIdealista();
} else if (target === "bbva") {
  testBbva();
} else if (target === "both") {
  testIdealista().then(() => testBbva());
} else {
  console.log("Uso: npx tsx test-browsers.ts [idealista|bbva|both]");
}
