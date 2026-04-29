# Plan: cap-scrap — Valoración automatizada de propiedades

## Contexto

El cliente gestiona una cartera de ~360 propiedades (mayoritariamente pisos en Madrid) en un Google Sheet. Necesita obtener valoraciones de mercado de cada propiedad usando dos herramientas web:

1. **Idealista Valoración** (`idealista.com/valoracion-de-inmuebles/`): introduce referencia catastral → precio estimado venta/alquiler con rangos
2. **BBVA Valora** (`web.bbva.es/.../housing-search`): introduce datos propiedad → valoración estimada
3. **Extra: Catastro** (`sedecatastro.gob.es`): consulta datos catastrales

Al pulsar un botón en el Sheet, se procesan solo las filas no analizadas.

---

## Estructura real del Spreadsheet

```
Col A: TIPO           → "Piso", "Piso + trastero", "Casa adosada"
Col B: ESTADO         → "Inactivo", "Con Incidencia", "Alquilado", "Activo", "Revisar", "Vendido"
Col C: CALLE          → Dirección completa
Col D: POBLACIÓN      → Ciudad (mayoritariamente "MADRID")
Col E: CP             → Código postal
Col F: M2             → Metros cuadrados
Col G: REF CATAST     → Referencia catastral (20 chars). ALGUNAS VACÍAS (~2 filas)
Col H: ??             → "SI" / "NO" (significado por confirmar)
Col I: ESTADO         → "Pleno Dominio" / "Copropiedad"
Col J: Precio         → Precio actual conocido (muchos "0.00 €")
```

**Columnas nuevas a añadir:**
```
Col K: Valoración Idealista  → Resultado del scraping
Col L: Valoración BBVA       → Resultado del scraping
Col M: Analizado             → TRUE/FALSE (control de procesamiento)
```

**Pestaña "Config" del Sheet (configurada por el cliente):**
```
Celda A1: DNI       | Celda B1: 12345678A
Celda A2: Gmail     | Celda B2: cliente@gmail.com
```
Gemini lee estos valores vía gws antes de empezar el procesamiento.

**Datos clave:**
- 360 filas, mayoritariamente Madrid
- Ref catastral es el input principal (ej: `6697111VK4769F0021AA`)
- 2 filas sin ref catastral → fallback a dirección
- Input para Idealista: ref catastral (o dirección)
- Input para BBVA: ref catastral / dirección + posiblemente DNI

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│  GOOGLE SHEET                                            │
│  ┌──────────┐                                            │
│  │ Botón:   │── Apps Script ── POST ──┐                  │
│  │ Analizar │   (webhook)             │                  │
│  └──────────┘                         ▼                  │
└───────────────────────────────────────│──────────────────┘
                                        │
┌───────────────────────────────────────▼──────────────────┐
│  RAILWAY (Docker container, ya pagado 20€/mes)           │
│                                                          │
│  server.js → recibe POST → lanza Gemini CLI              │
│                                                          │
│  Gemini CLI (--non-interactive, Flash model, free tier)   │
│  ├── gws CLI (extension) → lee/escribe Sheet             │
│  └── Playwright MCP → automatiza browser                 │
│                                                          │
│  Flujo:                                                  │
│  1. gws: leer Sheet, filtrar col M != TRUE               │
│  2. Para cada fila:                                      │
│     a. Tomar ref catastral (col G) o dirección (col C)   │
│     b. Playwright → idealista.com/valoracion-de-inmuebles│
│        → meter ref catastral → extraer valoración        │
│     c. gws → escribir en col K                           │
│     d. Playwright → BBVA Valora                          │
│        → meter datos → extraer valoración                │
│        → si cooldown: esperar o rotar IP                  │
│     e. gws → escribir en col L                           │
│     f. gws → marcar col M como TRUE                      │
└──────────────────────────────────────────────────────────┘
```

---

## Gestión de cooldowns BBVA

**Estrategia: proxy rotation (si el cooldown es por IP)**
- Usar servicio de proxies rotativos (Bright Data, SmartProxy, IPRoyal)
- ~5-15€/mes para el volumen necesario
- Se configura en Playwright: `browser.launch({ proxy: { server: '...' } })`
- Cada petición sale desde una IP diferente

**Si el cooldown es por sesión/DNI:**
- Procesar en lotes vía cron en Railway (ej: 30 filas cada 2 horas)
- Separar Idealista (rápido, sin cooldown) de BBVA (lento)

**Se validará en la fase de testing cuál aplica.**

---

## Tiempos estimados de ejecución (360 filas)

| Escenario | Idealista | BBVA | Total |
|-----------|-----------|------|-------|
| Sin bloqueos | ~3-6h | ~6-12h | ~9-18h |
| Con proxy rotation (BBVA) | ~3-6h | ~6-12h | ~9-18h |
| Sin proxy, con cooldown 10min | ~3-6h | ~60h (2.5 días) | ~63h |

---

## Archivos del repositorio

```
hackstler/cap-scrap/
├── Dockerfile                 # Playwright + Gemini CLI + gws CLI
├── .gemini/
│   ├── settings.json          # gws extension + Playwright MCP server config
│   └── prompt.md              # Instrucciones en lenguaje natural para Gemini
├── server.js                  # HTTP trigger (~20 líneas, Node nativo)
├── package.json
├── .env.example               # Template variables de entorno
└── apps-script/
    └── trigger.js             # Código a copiar en el Apps Script del Sheet
```

### Dockerfile
- Base: `mcr.microsoft.com/playwright:v1.56.1-noble`
- Instala: Gemini CLI, gws CLI
- Configura Playwright MCP como server para Gemini
- Expone puerto 3000

### server.js (~20 líneas)
- HTTP server Node.js nativo (sin frameworks)
- POST `/ejecutar` → valida auth token → ejecuta `gemini --non-interactive` con el prompt
- Responde 200 inmediatamente, proceso corre en background

### .gemini/settings.json
- Registra gws como extensión
- Configura Playwright MCP server (headless, chromium, no-sandbox)

### .gemini/prompt.md
- Instrucciones paso a paso en lenguaje natural
- Incluye: leer sheet, filtrar no analizados, navegar a cada web, extraer datos, escribir, marcar TRUE
- Se refinará con los flujos exactos de cada web tras testing manual

### Apps Script (trigger.js)
- ~5 líneas: POST al endpoint de Railway con auth token
- Se asocia a un botón en el Sheet
- Muestra alerta "Proceso lanzado"

---

## Variables de entorno (Railway)

| Variable | Valor |
|----------|-------|
| `GEMINI_API_KEY` | API key de Google AI Studio |
| `GWS_CREDENTIALS` | Service Account JSON (base64) |
| `SHEET_ID` | ID del Google Sheet |
| `AUTH_TOKEN` | Token compartido con Apps Script |
| ~~`DNI_BBVA`~~ | ~~Se lee de pestaña "Config" del Sheet~~ |
| ~~`GMAIL_BBVA`~~ | ~~Se lee de pestaña "Config" del Sheet~~ |
| `PROXY_URL` | URL del proxy rotativo (opcional) |

---

## Fases de implementación

### Fase 1: Repo + infra base
1. Crear repo `hackstler/cap-scrap` en GitHub
2. Dockerfile con Playwright + Gemini CLI + gws CLI
3. server.js (HTTP trigger)
4. package.json + .env.example

### Fase 2: Config Gemini CLI
5. .gemini/settings.json (extensiones + MCP)
6. .gemini/prompt.md (instrucciones workflow)
7. Test local: Gemini CLI headless funciona

### Fase 3: Google Sheets
8. Crear Service Account en GCP
9. Compartir Sheet con Service Account
10. Apps Script + botón en Sheet
11. Test: gws lee/escribe el Sheet

### Fase 4: Scraping webs
12. Test manual: flujo Idealista Valoración con ref catastral
13. Test manual: flujo BBVA Valora
14. Refinar prompt.md con flujos exactos
15. Test: Playwright automatiza ambas webs
16. Test: proxy rotation para BBVA cooldowns

### Fase 5: Deploy + E2E
17. Deploy a Railway desde GitHub
18. Configurar env vars
19. Test end-to-end: botón → Railway → scrape → Sheet
20. Ajustar timeouts y manejo de errores

---

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Gemini Flash insuficiente para automation | Alto | Iterar prompt. Fallback: Gemini Pro (~céntimos) o script determinista |
| DataDome bloquea Playwright en Idealista | Alto | La herramienta de valoración puede ser menos protegida que el buscador. Fallback: Apify |
| BBVA detecta automatización | Medio | Proxy rotation + delays humanizados |
| Railway sin memoria para Chromium | Medio | 1 instancia browser, `--disable-dev-shm-usage`, max 512MB |
| Refs catastrales vacías | Bajo | Fallback a dirección (col C + col D + col E) |

---

## Datos confirmados

- Columna H ("??"): irrelevante, se ignora. El campo "Analizado" se añade como columna nueva (M)
- **DNI y Gmail: configurables por el cliente en una pestaña "Config" del Spreadsheet** (ej: celda B1=DNI, B2=Gmail). NO son env vars — el cliente los pone y los cambia cuando quiera
- Lo único variable por fila: la referencia catastral (col G), fallback a dirección (col C+D+E) si vacía
- El formulario de BBVA usa: ref catastral + DNI + Gmail (leídos del Sheet)
- El formulario de Idealista usa: ref catastral (o dirección)
