"use client";

import { WoneyClient, type TokenPair, type TokenStorage } from "@woney/api-client";

const ACCESS_KEY = "woney.access";
const SESSION_FLAG = "woney.session";
/** @deprecated cleared on set/clear — refresh lives in HttpOnly cookie only */
const REFRESH_KEY = "woney.refresh";
const LEGACY_ACCESS_KEY = "ledger.access";
const LEGACY_REFRESH_KEY = "ledger.refresh";

/**
 * Browser storage: short-lived access JWT in sessionStorage.
 * Refresh token is HttpOnly Secure cookie (SameSite=None in production) — never localStorage.
 * `woney.session=1` in localStorage marks an active cookie session across tab reloads.
 */
class BrowserTokenStorage implements TokenStorage {
  getAccessToken() {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(LEGACY_ACCESS_KEY);
  }
  getRefreshToken() {
    // Web relies on HttpOnly cookie; do not read/write refresh from JS storage.
    return null;
  }
  setTokens(tokens: TokenPair) {
    sessionStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(SESSION_FLAG, "1");
    sessionStorage.removeItem(LEGACY_ACCESS_KEY);
    // Purge any pre-hardening refresh tokens from storage.
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
  clear() {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(LEGACY_ACCESS_KEY);
    localStorage.removeItem(SESSION_FLAG);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = new WoneyClient(baseUrl, new BrowserTokenStorage(), { cookieSession: true });

export function hasSession(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(SESSION_FLAG) === "1") return true;
  // Migrate: clear legacy refresh keys so subsequent auth uses the cookie path.
  if (localStorage.getItem(REFRESH_KEY) || localStorage.getItem(LEGACY_REFRESH_KEY)) {
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
    return false;
  }
  return sessionStorage.getItem(ACCESS_KEY) !== null;
}
