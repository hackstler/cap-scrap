import { chromium, Browser } from "playwright";
import { ExecuteRequest, ScrapingResult } from "./types";
import { scrapeIdealista } from "./scrapers/idealista";
import { scrapeBbva } from "./scrapers/bbva";
import { extractIdealistaData, extractBbvaData } from "./services/gemini";
import { writeResults } from "./services/sheets";

const DELAY_MS = 4000;
const MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
      if (attempt === MAX_RETRIES) throw err;
      await sleep(2000);
    }
  }
  throw new Error("Unreachable");
}

export async function processRows(request: ExecuteRequest): Promise<void> {
  const { config, rows } = request;
  console.log(`Starting processing of ${rows.length} rows`);

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const identifier = row.refCatastral || `${row.calle}, ${row.poblacion} ${row.cp}`;
      console.log(`[${i + 1}/${rows.length}] Processing row ${row.rowIndex}: ${identifier}`);

      const result: ScrapingResult = {
        rowIndex: row.rowIndex,
        idealista: null,
        bbva: null,
        idealistaError: null,
        bbvaError: null,
      };

      // Idealista
      try {
        const html = await withRetry(
          () => scrapeIdealista(browser!, row),
          `Idealista row ${row.rowIndex}`
        );
        result.idealista = await extractIdealistaData(html);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.idealistaError = `ERROR: ${msg}`;
        console.error(`[Idealista] Row ${row.rowIndex} failed: ${msg}`);
      }

      // BBVA
      try {
        const html = await withRetry(
          () => scrapeBbva(browser!, row, config),
          `BBVA row ${row.rowIndex}`
        );
        result.bbva = await extractBbvaData(html);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.bbvaError = `ERROR: ${msg}`;
        console.error(`[BBVA] Row ${row.rowIndex} failed: ${msg}`);
      }

      // Write results to Sheet
      try {
        await writeResults(result);
        console.log(`[${i + 1}/${rows.length}] Row ${row.rowIndex} written to Sheet`);
      } catch (err) {
        console.error(`[Sheets] Failed to write row ${row.rowIndex}:`, err);
      }

      // Delay between rows
      if (i < rows.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    console.log(`Finished processing ${rows.length} rows`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
