import { GoogleGenerativeAI } from "@google/generative-ai";
import { IdealistaData, BbvaData } from "../types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const IDEALISTA_PROMPT = `Analiza este HTML de la herramienta de valoración de Idealista y extrae los datos de valoración del inmueble.

Devuelve SOLO un JSON válido con esta estructura exacta, sin markdown ni explicaciones:
{
  "valoracionVenta": "precio estimado de venta (ej: 250.000 €)",
  "valoracionAlquiler": "precio estimado de alquiler mensual (ej: 1.200 €/mes)",
  "precioM2": "precio por metro cuadrado (ej: 3.500 €/m²)",
  "raw": "resumen breve de todos los datos relevantes encontrados"
}

Si no encuentras algún dato, pon "N/A". Si la página muestra un error o no hay valoración, pon todos los campos como "N/A" y en raw explica qué se ve.

HTML:
`;

const BBVA_PROMPT = `Analiza este HTML de la herramienta BBVA Valora y extrae los datos de valoración del inmueble.

Devuelve SOLO un JSON válido con esta estructura exacta, sin markdown ni explicaciones:
{
  "valoracion": "valoración estimada (ej: 280.000 €)",
  "valoracionMin": "valor mínimo del rango (ej: 250.000 €)",
  "valoracionMax": "valor máximo del rango (ej: 310.000 €)",
  "raw": "resumen breve de todos los datos relevantes encontrados"
}

Si no encuentras algún dato, pon "N/A". Si la página muestra un error o no hay valoración, pon todos los campos como "N/A" y en raw explica qué se ve.

HTML:
`;

function truncateHtml(html: string, maxChars: number = 60000): string {
  // Strip scripts and styles to save tokens
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  if (clean.length > maxChars) {
    clean = clean.substring(0, maxChars);
  }
  return clean;
}

function parseJsonResponse<T>(text: string): T {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  return JSON.parse(cleaned);
}

export async function extractIdealistaData(html: string): Promise<IdealistaData> {
  const truncated = truncateHtml(html);
  const result = await model.generateContent(IDEALISTA_PROMPT + truncated);
  const text = result.response.text();
  return parseJsonResponse<IdealistaData>(text);
}

export async function extractBbvaData(html: string): Promise<BbvaData> {
  const truncated = truncateHtml(html);
  const result = await model.generateContent(BBVA_PROMPT + truncated);
  const text = result.response.text();
  return parseJsonResponse<BbvaData>(text);
}
