"use client";

import { WoneyClient, type TokenPair, type TokenStorage } from "@woney/api-client";

const ACCESS_KEY = "woney.access";
const REFRESH_KEY = "woney.refresh";
const LEGACY_ACCESS_KEY = "ledger.access";
const LEGACY_REFRESH_KEY = "ledger.refresh";

class BrowserTokenStorage implements TokenStorage {
  getAccessToken() {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(LEGACY_ACCESS_KEY);
  }
  getRefreshToken() {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_KEY) ?? localStorage.getItem(LEGACY_REFRESH_KEY);
  }
  setTokens(tokens: TokenPair) {
    sessionStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    sessionStorage.removeItem(LEGACY_ACCESS_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
  clear() {
    sessionStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(LEGACY_ACCESS_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = new WoneyClient(baseUrl, new BrowserTokenStorage());

export function hasSession(): boolean {
  if (typeof window === "undefined") return false;
  return (
    localStorage.getItem(REFRESH_KEY) !== null || localStorage.getItem(LEGACY_REFRESH_KEY) !== null
  );
}
