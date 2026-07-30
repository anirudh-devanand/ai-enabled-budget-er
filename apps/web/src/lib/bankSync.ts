"use client";

import { api } from "@/lib/api";
import { getApiDetail } from "@/lib/errors";

export type BankSyncResult = {
  synced: number;
  failed: number;
  skipped: number;
  deduped: boolean;
};

export type BankSyncState = {
  syncing: boolean;
  error: string | null;
  result: BankSyncResult | null;
  lastStartedAt: number;
};

export const BANK_SYNC_DEBOUNCE_MS = 15_000;

let inflight: Promise<BankSyncResult> | null = null;
let state: BankSyncState = {
  syncing: false,
  error: null,
  result: null,
  lastStartedAt: 0,
};
const listeners = new Set<(s: BankSyncState) => void>();

function emit(next: Partial<BankSyncState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
}

export function getBankSyncState() {
  return state;
}

export function subscribeBankSync(listener: (s: BankSyncState) => void) {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Sync all of the signed-in user's bank connections.
 * Deduplicates concurrent calls and optionally skips if a sync just finished.
 */
export async function syncMyBanks(options?: {
  force?: boolean;
}): Promise<BankSyncResult> {
  const force = options?.force ?? false;

  if (inflight) {
    return inflight.then((result) => ({ ...result, deduped: true }));
  }

  if (!force && state.result && Date.now() - state.lastStartedAt < BANK_SYNC_DEBOUNCE_MS) {
    return { ...state.result, deduped: true };
  }

  emit({ syncing: true, error: null, lastStartedAt: Date.now() });

  inflight = (async () => {
    try {
      const response = await api.syncMineBanks();
      const result: BankSyncResult = {
        synced: response.synced,
        failed: response.failed,
        skipped: response.skipped,
        deduped: false,
      };
      const error =
        response.failed > 0
          ? `Synced ${response.synced}, ${response.failed} failed — if your bank needs a new login, reconnect it from Connect (Plaid update).`
          : null;
      emit({ syncing: false, error, result });
      return result;
    } catch (err) {
      const message = getApiDetail(err) || "Bank sync failed";
      // MFA not enabled yet — not an error for login kickoff / soft refresh.
      if (message === "mfa_required" || /mfa_required/i.test(message)) {
        const empty: BankSyncResult = {
          synced: 0,
          failed: 0,
          skipped: 0,
          deduped: false,
        };
        emit({ syncing: false, error: null, result: empty });
        return empty;
      }
      emit({ syncing: false, error: message, result: null });
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Fire-and-forget sync for login — does not block navigation. */
export function kickoffBankSync() {
  void syncMyBanks({ force: false }).catch(() => undefined);
}
