"use client";

import type { SyncReauthRequired } from "@woney/api-client";
import { api } from "@/lib/api";
import {
  getApiDetail,
  parseItemLoginRequired,
  userFacingError,
  type BankReauthTarget,
} from "@/lib/errors";

export type BankSyncResult = {
  synced: number;
  failed: number;
  skipped: number;
  deduped: boolean;
  reauthRequired: BankReauthTarget[];
};

export type BankSyncState = {
  syncing: boolean;
  error: string | null;
  result: BankSyncResult | null;
  lastStartedAt: number;
  /** Connections that need Plaid Link update mode after a sync attempt. */
  reauthRequired: BankReauthTarget[];
};

export const BANK_SYNC_DEBOUNCE_MS = 15_000;

let inflight: Promise<BankSyncResult> | null = null;
let state: BankSyncState = {
  syncing: false,
  error: null,
  result: null,
  lastStartedAt: 0,
  reauthRequired: [],
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

function mapReauth(items: SyncReauthRequired[] | undefined): BankReauthTarget[] {
  if (!items?.length) return [];
  return items
    .filter((item) => item.code === "ITEM_LOGIN_REQUIRED" && item.connection_id && item.household_id)
    .map((item) => ({
      connectionId: item.connection_id,
      householdId: item.household_id,
      institutionName: item.institution_name ?? null,
      code: item.code,
    }));
}

/** Show (or replace) the in-app bank re-login prompt. */
export function promptBankReauth(targets: BankReauthTarget[]) {
  if (!targets.length) return;
  emit({ reauthRequired: targets });
}

export function dismissBankReauth() {
  emit({ reauthRequired: [] });
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
      const reauthRequired = mapReauth(response.reauth_required);
      const result: BankSyncResult = {
        synced: response.synced,
        failed: response.failed,
        skipped: response.skipped,
        deduped: false,
        reauthRequired,
      };
      const error =
        response.failed > 0 && reauthRequired.length === 0
          ? `Synced ${response.synced}, ${response.failed} failed`
          : null;
      emit({
        syncing: false,
        error,
        result,
        // Replace prompt when this sync reports reauth; clear when none needed.
        reauthRequired,
      });
      return result;
    } catch (err) {
      const reauth = parseItemLoginRequired(err);
      if (reauth) {
        const empty: BankSyncResult = {
          synced: 0,
          failed: 1,
          skipped: 0,
          deduped: false,
          reauthRequired: [reauth],
        };
        emit({ syncing: false, error: null, result: empty });
        promptBankReauth([reauth]);
        return empty;
      }
      const raw = getApiDetail(err, "");
      // MFA not enabled yet — not an error for login kickoff / soft refresh.
      if (raw === "mfa_required" || /mfa_required/i.test(raw)) {
        const empty: BankSyncResult = {
          synced: 0,
          failed: 0,
          skipped: 0,
          deduped: false,
          reauthRequired: [],
        };
        emit({ syncing: false, error: null, result: empty });
        return empty;
      }
      emit({
        syncing: false,
        error: userFacingError(err, "Could not sync banks. Please try again."),
        result: null,
      });
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
