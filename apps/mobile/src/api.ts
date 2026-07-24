import * as SecureStore from "expo-secure-store";
import { WoneyClient, type TokenPair, type TokenStorage } from "@woney/api-client";

const ACCESS_KEY = "woney.access";
const REFRESH_KEY = "woney.refresh";
const LEGACY_ACCESS_KEY = "ledger.access";
const LEGACY_REFRESH_KEY = "ledger.refresh";

/**
 * Refresh tokens live in the platform keychain via SecureStore; the access
 * token is kept in memory only (it expires in 15 minutes anyway).
 */
class SecureTokenStorage implements TokenStorage {
  private access: string | null = null;
  private refresh: string | null =
    SecureStore.getItem(REFRESH_KEY) ?? SecureStore.getItem(LEGACY_REFRESH_KEY);

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
    SecureStore.deleteItemAsync(LEGACY_REFRESH_KEY).catch(() => undefined);
    SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY).catch(() => undefined);
  }
  clear() {
    this.access = null;
    this.refresh = null;
    SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => undefined);
    SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => undefined);
    SecureStore.deleteItemAsync(LEGACY_REFRESH_KEY).catch(() => undefined);
    SecureStore.deleteItemAsync(LEGACY_ACCESS_KEY).catch(() => undefined);
  }
}

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = new WoneyClient(baseUrl, new SecureTokenStorage());
