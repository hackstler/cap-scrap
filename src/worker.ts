import { chromium, Browser } from "patchright";
import { ExecuteRequest, ScrapingResult, IdealistaData } from "./types";
import { scrapeIdealista } from "./scrapers/idealista";
import { scrapeBbva } from "./scrapers/bbva";
import { extractBbvaData } from "./services/gemini";
import { writeResults } from "./services/sheets";

// Configurable via env vars
const DELAY_BETWEEN_REQUESTS_MS = parseInt(
  process.env.DELAY_BETWEEN_REQUESTS || "10000",
  10
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(baseMs: number): number {
  // ±30% jitter to avoid regular timing patterns
  return baseMs + Math.round((Math.random() - 0.5) * baseMs * 0.6);
}

function getLaunchOptions(): Parameters<typeof chromium.launch>[0] {
  const opts: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  };

  if (process.env.PROXY_URL) {
    const [host, port, user, pass] = process.env.PROXY_URL.split(":");
    opts.proxy = {
      server: `http://${host}:${port}`,
      username: user,
      password: pass,
    };
  }

  return opts;
}

export async function processRows(request: ExecuteRequest): Promise<void> {
  const { config, rows } = request;
  console.log(`\n=== Starting processing of ${rows.length} rows ===`);
  console.log(`Delay between requests: ${DELAY_BETWEEN_REQUESTS_MS}ms`);

  // ─── Phase 1: Idealista via Scrapfly (no browser needed) ───
  console.log(`\n--- Phase 1: Idealista (${rows.length} rows) ---`);

  const idealistaResults = new Map<
    number,
    { data?: IdealistaData; error?: string }
  >();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const identifier = row.refCatastral || row.calle;
    console.log(
      `\n[${i + 1}/${rows.length}] Row ${row.rowIndex}: ${identifier}`
    );

    if (!row.refCatastral) {
      idealistaResults.set(row.rowIndex, {
        error: "Sin referencia catastral",
      });
      continue;
    }

    try {
      const data = await scrapeIdealista(row, config.gmail);
      idealistaResults.set(row.rowIndex, { data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      idealistaResults.set(row.rowIndex, { error: msg });
      console.error(`[Idealista] Row ${row.rowIndex} failed: ${msg}`);
    }

    // Delay between requests to avoid DataDome rate limiting
    if (i < rows.length - 1) {
      const delay = randomDelay(DELAY_BETWEEN_REQUESTS_MS);
      console.log(`[Wait] ${Math.round(delay / 1000)}s before next request...`);
      await sleep(delay);
    }
  }

  // ─── Phase 2: Write results to Sheet ───
  // (BBVA scraping is parked — add here when ready)
  console.log(`\n--- Phase 2: Writing results to Sheet ---`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const idealistaEntry = idealistaResults.get(row.rowIndex);

    const result: ScrapingResult = {
      rowIndex: row.rowIndex,
      idealista: idealistaEntry?.data || null,
      bbva: null,
      idealistaError: idealistaEntry?.error
        ? `ERROR: ${idealistaEntry.error}`
        : null,
      bbvaError: null,
    };

    if (result.idealista) {
      successCount++;
    } else {
      errorCount++;
    }

    try {
      await writeResults(result);
      console.log(
        `[${i + 1}/${rows.length}] Row ${row.rowIndex} written to Sheet`
      );
    } catch (err) {
      console.error(`[Sheets] Failed to write row ${row.rowIndex}:`, err);
    }

    // Small delay between Sheet writes to avoid quota limits
    if (i < rows.length - 1) {
      await sleep(500);
    }
  }

  console.log(
    `\n=== Finished: ${successCount} OK, ${errorCount} errors out of ${rows.length} rows ===`
  );
}
