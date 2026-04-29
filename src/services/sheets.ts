import { google } from "googleapis";
import { ScrapingResult } from "../types";

function getAuth() {
  const credentialsB64 = process.env.GWS_CREDENTIALS_B64;
  if (!credentialsB64) {
    throw new Error("GWS_CREDENTIALS_B64 env var not set");
  }

  const credentials = JSON.parse(
    Buffer.from(credentialsB64, "base64").toString("utf-8")
  );

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function formatIdealistaCell(result: ScrapingResult): string {
  if (result.idealistaError) return result.idealistaError;
  if (!result.idealista) return "ERROR: No data";

  const d = result.idealista;
  return `Venta: ${d.valoracionVenta} | Alquiler: ${d.valoracionAlquiler} | €/m²: ${d.precioM2}`;
}

function formatBbvaCell(result: ScrapingResult): string {
  if (result.bbvaError) return result.bbvaError;
  if (!result.bbva) return "ERROR: No data";

  const d = result.bbva;
  return `Valoración: ${d.valoracion} (${d.valoracionMin} - ${d.valoracionMax})`;
}

export async function writeResults(result: ScrapingResult): Promise<void> {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) throw new Error("SHEET_ID env var not set");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  // Row index from the sheet (1-based, row 1 is header)
  const row = result.rowIndex;

  const idealistaValue = formatIdealistaCell(result);
  const bbvaValue = formatBbvaCell(result);

  // Write K (col 11), L (col 12), M (col 13) for this row
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `Sheet1!K${row}:M${row}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[idealistaValue, bbvaValue, "TRUE"]],
    },
  });
}
