// background/error-codes.js
// Shared error code constants used across content scripts and background.
// Avoids fragile string matching for error classification.

const ErrorCodes = Object.freeze({
  IP_BAN: "IP_BAN",
  API_ERROR: "API_ERROR",
  DOM_TIMEOUT: "DOM_TIMEOUT",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
});
