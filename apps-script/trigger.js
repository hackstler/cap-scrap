/**
 * Apps Script — copiar este código en el editor de Apps Script del Google Sheet.
 * Menú: Extensiones > Apps Script
 *
 * Después de pegar, crear un botón en el Sheet:
 * Insertar > Dibujo > crear botón > click derecho > Asignar script > lanzarAnalisis
 */

const SERVER_URL = "https://cap-scrap.up.railway.app"; // Cambiar por la URL real de Railway
const AUTH_TOKEN = "CHANGE_ME"; // Mismo token que AUTH_TOKEN en Railway

function lanzarAnalisis() {
  const config = leerConfig();
  const rows = leerFilasNoAnalizadas();

  if (rows.length === 0) {
    SpreadsheetApp.getUi().alert("No hay filas pendientes de analizar.");
    return;
  }

  const payload = {
    config: config,
    rows: rows,
  };

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + AUTH_TOKEN,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(SERVER_URL + "/ejecutar", options);
    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code === 200) {
      SpreadsheetApp.getUi().alert(
        "Proceso lanzado correctamente.\n" +
          rows.length +
          " filas en proceso.\n" +
          "Los resultados se irán escribiendo en las columnas K, L y M."
      );
    } else {
      SpreadsheetApp.getUi().alert("Error del servidor: " + code + "\n" + body);
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error de conexión: " + e.message);
  }
}

function leerConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName("Config");

  if (!configSheet) {
    throw new Error(
      'No se encontró la pestaña "Config". Créala con DNI en B1 y Gmail en B2.'
    );
  }

  return {
    dni: configSheet.getRange("B1").getValue().toString(),
    gmail: configSheet.getRange("B2").getValue().toString(),
  };
}

function leerFilasNoAnalizadas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0]; // Primera pestaña (datos)
  var data = sheet.getDataRange().getValues();
  var rows = [];

  // Empezar en fila 2 (index 1) para saltar cabecera
  for (var i = 1; i < data.length; i++) {
    var analizado = data[i][12]; // Columna M (index 12)

    if (analizado === true || analizado === "TRUE" || analizado === "true") {
      continue;
    }

    rows.push({
      rowIndex: i + 1, // 1-based para la API de Sheets
      tipo: data[i][0] || "",
      estado: data[i][1] || "",
      calle: data[i][2] || "",
      poblacion: data[i][3] || "",
      cp: data[i][4] || "",
      m2: data[i][5] || "",
      refCatastral: data[i][6] || "",
      estadoPropiedad: data[i][8] || "",
      precio: data[i][9] || "",
    });
  }

  return rows;
}
