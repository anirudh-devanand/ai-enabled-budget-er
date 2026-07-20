import * as SecureStore from "expo-secure-store";
import { LedgerClient, type TokenPair, type TokenStorage } from "@ledger/api-client";

const ACCESS_KEY = "ledger.access";
const REFRESH_KEY = "ledger.refresh";

/**
 * Refresh tokens live in the platform keychain via SecureStore; the access
 * token is kept in memory only (it expires in 15 minutes anyway).
 */
class SecureTokenStorage implements TokenStorage {
  private access: string | null = null;
  private refresh: string | null = SecureStore.getItem(REFRESH_KEY);

  getAccessToken() {
    return this.access;
  }
  getRefreshToken() {
    return this.refresh;
  }
  setTokens(tokens: TokenPair) {
    this.access = tokens.access_token;
    this.refresh = tokens.refresh_token;
    SecureStore.setItem(REFRESH_KEY, tokens.refresh_token);
  }
  clear() {
    this.access = null;
    this.refresh = null;
    SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
    SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => undefined);
  }
}

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = new LedgerClient(baseUrl, new SecureTokenStorage());
