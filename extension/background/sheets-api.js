// background/sheets-api.js
// Responsibility: All Google Sheets API interactions (read rows, write results).

var SheetsApi = (function () {
  "use strict";

  var SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";
  var DEFAULT_TAB_NAME = "ORIGINAL";

  async function getTabName() {
    var data = await chrome.storage.local.get("tabName");
    return data.tabName || DEFAULT_TAB_NAME;
  }
  function sanitizeSheetId(sheetId) {
    return sheetId.replace(/\/+$/, "").trim();
  }

  function buildAuthHeaders(token) {
    return { Authorization: "Bearer " + token };
  }

  function parseRowData(rawRow) {
    return {
      tipo: rawRow[0] || "",
      estado: rawRow[1] || "",
      calle: rawRow[2] || "",
      poblacion: rawRow[3] || "",
      cp: rawRow[4] || "",
      m2: rawRow[5] || "",
      refCatastral: rawRow[6] || "",
      estadoPropiedad: rawRow[8] || "",
      precio: rawRow[9] || "",
    };
  }

  function isRowAlreadyProcessed(rawRow) {
    // Column N (index 13) is the "analizado" flag in the current layout (K=Venta, L=Alquiler, M=Screenshot, N=TRUE).
    var colN = (rawRow[13] || "").toString().toUpperCase();
    return colN === "TRUE";
  }

  /**
   * Reads pending rows from the ORIGINAL tab.
   * Returns only rows where column N is NOT "TRUE".
   */
  async function readPendingRows(sheetId, token) {
    sheetId = sanitizeSheetId(sheetId);
    var tabName = await getTabName();
    var readRange = "A2:N";
    var encodedRange = encodeURIComponent(tabName + "!" + readRange);
    var url = SHEETS_BASE_URL + "/" + sheetId + "/values/" + encodedRange;

    var response = await fetch(url, {
      headers: buildAuthHeaders(token),
    });

    if (!response.ok) {
      var body = await response.text();
      throw new Error("Sheets API error " + response.status + ": " + body);
    }

    var data = await response.json();
    var rawValues = data.values || [];
    var pendingRows = [];

    for (var i = 0; i < rawValues.length; i++) {
      var rawRow = rawValues[i];
      var rowNum = i + 2;
      var colNValue = (rawRow[13] || "").toString();

      if (isRowAlreadyProcessed(rawRow)) {
        Logger.info("Fila " + rowNum + ": col N='" + colNValue + "' → SKIP");
        continue;
      }

      Logger.info("Fila " + rowNum + ": col N='" + colNValue + "' → PENDIENTE");
      var rowData = parseRowData(rawRow);
      rowData.rowIndex = rowNum;
      pendingRows.push(rowData);
    }

    return pendingRows;
  }

  /**
   * Writes valuation results to columns K-N for a given row.
   * K = Venta, L = Alquiler, M = Screenshot URL, N = TRUE
   */
  async function writeValuationResult(sheetId, token, rowIndex, resultData) {
    sheetId = sanitizeSheetId(sheetId);
    var tabName = await getTabName();
    var range = tabName + "!K" + rowIndex + ":N" + rowIndex;
    var encodedRange = encodeURIComponent(range);
    var url = SHEETS_BASE_URL + "/" + sheetId + "/values/" + encodedRange + "?valueInputOption=USER_ENTERED";

    var cellValues;
    if (resultData.error) {
      cellValues = [["ERROR: " + resultData.error, "", "", "TRUE"]];
    } else {
      cellValues = [[
        resultData.venta || "N/A",
        resultData.alquiler || "N/A",
        resultData.screenshotUrl || "",
        "TRUE",
      ]];
    }

    Logger.info("[Sheet] Escribiendo fila " + rowIndex + ": " + JSON.stringify(cellValues[0]).substring(0, 100));

    var response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: cellValues }),
    });

    if (!response.ok) {
      var body = await response.text();
      Logger.error("[Sheet] Error escribiendo fila " + rowIndex + ": " + response.status + " " + body.substring(0, 200));
      throw new Error("Sheet write error " + response.status);
    }

    Logger.info("[Sheet] Fila " + rowIndex + " escrita OK");
  }

  return {
    readPendingRows: readPendingRows,
    writeValuationResult: writeValuationResult,
  };
})();
