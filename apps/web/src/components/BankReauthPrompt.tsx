"use client";

import Link from "next/link";
import { dismissBankReauth } from "@/lib/bankSync";
import { reconnectPath, type BankReauthTarget } from "@/lib/errors";

export function BankReauthPrompt({ targets }: { targets: BankReauthTarget[] }) {
  if (!targets.length) return null;

  const primary = targets[0];
  const bankLabel = primary.institutionName?.trim() || "your bank";
  const extra =
    targets.length > 1 ? ` (${targets.length} connections need a fresh login)` : "";

  return (
    <div
      className="reauth-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissBankReauth();
      }}
    >
      <div className="reauth-dialog card">
        <h2 id="reauth-title">Bank login required</h2>
        <p className="sub">
          Sync can’t continue for <strong>{bankLabel}</strong>
          {extra} until you sign in again (password, MFA, or a security check).
          Reconnecting updates your existing link — it won’t create a duplicate.
        </p>
        <div className="reauth-actions">
          <button type="button" className="btn btn-ghost" onClick={() => dismissBankReauth()}>
            Not now
          </button>
          <Link
            href={reconnectPath(primary)}
            className="btn btn-primary"
            onClick={() => dismissBankReauth()}
          >
            Reconnect with Plaid
          </Link>
        </div>
        {targets.length > 1 && (
          <ul className="reauth-list muted">
            {targets.map((t) => (
              <li key={t.connectionId}>
                <Link href={reconnectPath(t)} onClick={() => dismissBankReauth()}>
                  {t.institutionName?.trim() || "Bank connection"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
