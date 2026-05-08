// background/sheets-api.js
// Responsibility: All Google Sheets API interactions (read rows, write results).

const SheetsApi = (() => {
  "use strict";

  const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
  const DEFAULT_TAB_NAME = "ORIGINAL";

  // ─── Column Helpers ───

  const columnLetterToIndex = (letter) => {
    let index = 0;
    const upper = letter.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      index = index * 26 + (upper.charCodeAt(i) - 64);
    }
    return index - 1;
  };

  const indexToColumnLetter = (index) => {
    let letter = "";
    let n = index + 1;
    while (n > 0) {
      n--;
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26);
    }
    return letter;
  };

  const getColumnConfig = async () => {
    const data = await chrome.storage.local.get(["colRefCatastral", "colResultStart"]);
    const refCol = (data.colRefCatastral || "G").toUpperCase();
    const startCol = (data.colResultStart || "K").toUpperCase();
    const startIdx = columnLetterToIndex(startCol);
    return {
      refCatastralIndex: columnLetterToIndex(refCol),
      refCatastralLetter: refCol,
      maxVentaLetter: startCol,
      minVentaLetter: indexToColumnLetter(startIdx + 1),
      screenshotLetter: indexToColumnLetter(startIdx + 2),
      flagLetter: indexToColumnLetter(startIdx + 3),
      flagIndex: startIdx + 3,
    };
  };

  // ─── Helpers ───

  const getTabName = async () => {
    const data = await chrome.storage.local.get("tabName");
    return data.tabName || DEFAULT_TAB_NAME;
  };

  const sanitizeSheetId = (sheetId) => sheetId.replace(/\/+$/, "").trim();

  const buildAuthHeaders = (token) => ({ Authorization: `Bearer ${token}` });

  // ─── Read ───

  const readPendingRows = async (sheetId, token) => {
    const cleanId = sanitizeSheetId(sheetId);
    const tabName = await getTabName();
    const colConfig = await getColumnConfig();

    const lastColIndex = Math.max(colConfig.flagIndex, colConfig.refCatastralIndex);
    const lastColLetter = indexToColumnLetter(lastColIndex);
    const readRange = `A2:${lastColLetter}`;
    const encodedRange = encodeURIComponent(`${tabName}!${readRange}`);
    const url = `${SHEETS_BASE_URL}/${cleanId}/values/${encodedRange}`;

    Logger.info(`[Sheet] Leyendo rango ${readRange} (ref=${colConfig.refCatastralLetter}, flag=${colConfig.flagLetter})`);

    const response = await fetch(url, {
      headers: buildAuthHeaders(token),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Sheets API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const rawValues = data.values || [];
    const pendingRows = [];

    for (let i = 0; i < rawValues.length; i++) {
      const rawRow = rawValues[i];
      const rowNum = i + 2;
      const flagValue = (rawRow[colConfig.flagIndex] || "").toString().toUpperCase();

      if (flagValue === "TRUE") {
        Logger.info(`Fila ${rowNum}: col ${colConfig.flagLetter}='${flagValue}' → SKIP`);
        continue;
      }

      Logger.info(`Fila ${rowNum}: col ${colConfig.flagLetter}='${rawRow[colConfig.flagIndex]}' → PENDIENTE`);
      const refCatastral = (rawRow[colConfig.refCatastralIndex] || "").toString().trim();
      pendingRows.push({ rowIndex: rowNum, refCatastral });
    }

    return pendingRows;
  };

  // ─── Write ───

  const writeValuationResult = async (sheetId, token, rowIndex, resultData) => {
    const cleanId = sanitizeSheetId(sheetId);
    const tabName = await getTabName();
    const colConfig = await getColumnConfig();

    const range = `${tabName}!${colConfig.maxVentaLetter}${rowIndex}:${colConfig.flagLetter}${rowIndex}`;
    const encodedRange = encodeURIComponent(range);
    const url = `${SHEETS_BASE_URL}/${cleanId}/values/${encodedRange}?valueInputOption=USER_ENTERED`;

    const cellValues = resultData.error
      ? [[`ERROR: ${resultData.error}`, "", resultData.screenshotUrl || "", ""]]
      : [[
          resultData.maxVenta ?? "N/A",
          resultData.minVenta ?? "N/A",
          resultData.screenshotUrl || "",
          "TRUE",
        ]];

    Logger.info(`[Sheet] Escribiendo fila ${rowIndex} en ${colConfig.maxVentaLetter}:${colConfig.flagLetter}: ${JSON.stringify(cellValues[0]).substring(0, 100)}`);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: cellValues }),
    });

    if (!response.ok) {
      const body = await response.text();
      Logger.error(`[Sheet] Error escribiendo fila ${rowIndex}: ${response.status} ${body.substring(0, 200)}`);
      throw new Error(`Sheet write error ${response.status}`);
    }

    Logger.info(`[Sheet] Fila ${rowIndex} escrita OK`);
  };

  return { readPendingRows, writeValuationResult };
})();
