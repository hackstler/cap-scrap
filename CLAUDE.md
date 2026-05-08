# Cap Valoraciones — Chrome Extension

## Project Overview

Chrome Extension (Manifest V3) that automates property valuation lookups on Idealista using cadastral references from a Google Sheet. Writes results (sale price, rental price, screenshot URL, processed flag) back to the sheet and uploads screenshots to Google Drive.

The extension must run completely unattended for 9+ hours processing ~360 properties with automatic token refresh, IP ban detection, and pause/resume.

## Architecture

```
extension/
├── background/          # Service worker (MV3)
│   ├── config.js        # OAuth credentials (GITIGNORED)
│   ├── error-codes.js   # Shared error constants
│   ├── logger.js        # Log buffer (persisted to storage)
│   ├── token-manager.js # OAuth2 lifecycle (exchange, refresh)
│   ├── sheets-api.js    # Google Sheets read/write
│   ├── drive-api.js     # Google Drive folder + screenshot upload
│   ├── orchestrator.js  # Main run loop, scheduling, ban management
│   └── index.js         # Entry point, message router, alarm handler
├── content/             # Content scripts (injected into Idealista pages)
│   ├── api-interceptor.js  # Intercepts Idealista API responses for ban detection
│   ├── dom-helpers.js      # Generic DOM utilities (sleep, waitForSelector)
│   ├── form-automation.js  # Automates Idealista valuation form
│   ├── price-extractor.js  # Extracts prices from DOM
│   └── index.js            # Content script entry point
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic
└── manifest.json        # MV3 manifest
```

Modules are loaded via `importScripts()` in the service worker (no bundler). Content scripts are declared in `manifest.json` and share scope through the content script execution context.

## Code Standards

### Language & Syntax

- **ES6+ only**: `const` by default, `let` only when reassignment is needed. Never use `var`.
- Arrow functions for callbacks and anonymous functions.
- Template literals for string interpolation — no `+` concatenation.
- Destructuring where it improves readability.
- Optional chaining (`?.`) and nullish coalescing (`??`) where appropriate.
- `for...of` for iterable loops. Array methods (`.map`, `.filter`, `.find`, `.some`) over manual loops.
- Shorthand object properties (`{ sheetId }` not `{ sheetId: sheetId }`).

### SOLID Principles

- **Single Responsibility**: Each file has one clear responsibility (see Architecture). Don't mix concerns — token management, API calls, DOM manipulation, and orchestration live in separate modules.
- **Open/Closed**: Use constants and configuration (e.g., `ErrorCodes`, column config from storage) instead of hardcoded values. New error types or column layouts shouldn't require editing detection logic.
- **Dependency Inversion**: Modules communicate through well-defined interfaces (return objects from IIFEs). The orchestrator delegates to `TokenManager`, `SheetsApi`, `DriveApi` — it doesn't implement their internals.

### Error Handling

- Use `ErrorCodes` constants for error classification — never match errors by string content.
- Content scripts prefix error messages with error code constants that match `ErrorCodes` in the background.
- The orchestrator's `classifyError()` function is the single point of error classification.
- Always handle token expiry explicitly — don't let 401s propagate silently.

### State Management

- All persistent state goes through `chrome.storage.local`.
- The orchestrator's run state survives service worker restarts via the `runState` storage key.
- When saving state after long operations, always re-check `isStillRunning()` before `saveState()` to avoid overwriting a user-initiated stop.

### Security

- OAuth credentials live in `config.js` which is **gitignored**. Never commit secrets.
- Use authorization code flow with refresh tokens — never implicit flow for long-running processes.
- Refresh tokens before each row to handle 1-hour access token expiry.
- Template: `extension/background/config.js.example` shows the expected format without real values.

## Google APIs Reference

- Sheets API v4: https://developers.google.com/workspace/sheets/api/reference/rest
- Drive API v3: https://developers.google.com/workspace/drive/api/reference/rest/v3
- Chrome Identity API: https://developer.chrome.com/docs/extensions/reference/api/identity
- Chrome Storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome Alarms API: https://developer.chrome.com/docs/extensions/reference/api/alarms
- OAuth2 in Extensions: https://developer.chrome.com/docs/extensions/how-to/integrate/oauth
- OAuth2 Best Practices: https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- Manifest V3: https://developer.chrome.com/docs/extensions/reference/manifest

## Conventions

- All user-facing strings are in Spanish.
- Column configuration (cadastral reference column, results start column) is read from `chrome.storage.local` with sensible defaults (G and K).
- The popup saves all config to storage; background modules read from storage — no message passing for config.
- Logs are buffered in-memory and persisted to storage (max 500 entries). Downloadable from popup.

## What NOT to Do

- Don't add `var` — ever.
- Don't match errors by string content — use `ErrorCodes`.
- Don't hardcode spreadsheet column letters — use the configurable column system.
- Don't commit `config.js` or any file containing OAuth credentials.
- Don't add features that break existing functionality — verify all existing flows still work after changes.
- Don't add npm dependencies or build tools — this is a vanilla JS Chrome Extension.
- Don't create unnecessary abstractions for one-time operations.
- Don't store redundant data in the run state — only what's needed for crash recovery.
