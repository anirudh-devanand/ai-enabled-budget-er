"use client";

import { LedgerClient, type TokenPair, type TokenStorage } from "@ledger/api-client";

const ACCESS_KEY = "ledger.access";
const REFRESH_KEY = "ledger.refresh";

class BrowserTokenStorage implements TokenStorage {
  getAccessToken() {
    return typeof window === "undefined" ? null : sessionStorage.getItem(ACCESS_KEY);
  }
  getRefreshToken() {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
  }
  setTokens(tokens: TokenPair) {
    sessionStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  }
  clear() {
    sessionStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = new LedgerClient(baseUrl, new BrowserTokenStorage());

export function hasSession(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(REFRESH_KEY) !== null;
}
