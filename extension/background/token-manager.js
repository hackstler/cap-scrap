// background/token-manager.js
// Responsibility: OAuth2 token lifecycle — exchange, refresh, validation.
// Uses OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET from config.js.

const TokenManager = (() => {
  "use strict";

  const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

  const exchangeCodeForTokens = async (code) => {
    const redirectUri = chrome.identity.getRedirectURL();
    const body = `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}&client_secret=${encodeURIComponent(OAUTH_CLIENT_SECRET)}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`;

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Code exchange failed: ${response.status} ${errBody.substring(0, 200)}`);
    }

    const tokens = await response.json();
    if (tokens.refresh_token) {
      await chrome.storage.local.set({ refreshToken: tokens.refresh_token });
      Logger.info("Refresh token almacenado");
    }
    return tokens.access_token;
  };

  const refreshAccessToken = async () => {
    const data = await chrome.storage.local.get("refreshToken");
    if (!data.refreshToken) {
      throw new Error("No hay refresh token");
    }

    const body = `client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}&client_secret=${encodeURIComponent(OAUTH_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(data.refreshToken)}&grant_type=refresh_token`;

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      const errBody = await response.text();
      if (response.status === 400 || response.status === 401) {
        await chrome.storage.local.remove("refreshToken");
      }
      throw new Error(`Refresh failed: ${response.status} ${errBody.substring(0, 200)}`);
    }

    const tokens = await response.json();
    return tokens.access_token;
  };

  const ensureValidToken = async (state) => {
    try {
      const newToken = await refreshAccessToken();
      state.token = newToken;
      return newToken;
    } catch (e) {
      Logger.error(`Token refresh failed: ${e.message}`);
      throw new Error(ErrorCodes.TOKEN_EXPIRED);
    }
  };

  return { exchangeCodeForTokens, refreshAccessToken, ensureValidToken };
})();
