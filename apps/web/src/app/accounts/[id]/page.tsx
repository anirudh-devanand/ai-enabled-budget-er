"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AccountDetailResponse, AccountResponse, TransactionResponse } from "@woney/api-client";
import { AppShell, CategoryIcon } from "@/components/ui";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

export default function AccountDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = String(params.id);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountDetailResponse | null>(null);
  const [nickname, setNickname] = useState("");
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) return;

        try {
          const detail = await api.getAccount(accountId);
          setAccount(detail);
          setNickname(detail.nickname || "");
          setNotes(detail.notes || "");
          setCanEdit(true);
        } catch {
          // Fallback when detail endpoint isn't deployed yet.
          const [accs, txns] = await Promise.all([
            api.listAccounts(hid),
            api.listTransactions(hid, 80).catch(() => ({ items: [], total: 0 })),
          ]);
          const match = accs.find((a: AccountResponse) => a.id === accountId);
          if (!match) {
            setError("Account not found");
            return;
          }
          const recent: TransactionResponse[] = txns.items.filter(
            (t) => t.account_id === accountId,
          );
          setAccount({
            ...match,
            display_name: match.display_name || match.name,
            recent_transactions: recent,
          });
          setNickname(match.nickname || "");
          setNotes(match.notes || "");
          setCanEdit(false);
        }
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
        else setError("Could not load account");
      }
    })();
  }, [accountId, router]);

  async function save() {
    if (!canEdit) {
      setToast("Account editing needs a backend update — redeploy the API first.");
      return;
    }
    try {
      const updated = await api.updateAccount(accountId, {
        nickname: nickname.trim() || null,
        notes: notes.trim() || null,
      });
      setAccount((prev) => (prev ? { ...prev, ...updated } : prev));
      setToast("Account updated");
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      if (isUnauthorized(err)) router.replace("/login");
      else setToast("Could not save — API may need redeploy");
    }
  }

  if (error) {
    return (
      <AppShell householdId={householdId}>
        <p className="error">{error}</p>
        <Link href="/dashboard" className="btn btn-ghost" style={{ textDecoration: "none" }}>
          Back to home
        </Link>
      </AppShell>
    );
  }

  if (!account) {
    return (
      <div className="app-main">
        <WoneyLoader label="Loading account…" />
      </div>
    );
  }

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>{account.display_name || account.name}</h1>
          <p>
            {account.type}
            {account.masked_number ? ` ····${account.masked_number}` : ""}
            {account.institution_name ? ` · ${account.institution_name}` : ""}
          </p>
        </div>
        <div className="page-actions">
          <Link href="/dashboard" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Back
          </Link>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="hero-balance">
        <div className="label">Balance</div>
        <div className="amount">{formatMoney(account.balance, account.currency)}</div>
        <div className="meta">{account.currency}</div>
      </div>

      <div className="tile" style={{ maxWidth: 480, marginBottom: 24 }}>
        <h2>Account details</h2>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="nick">Nickname</label>
          <input
            id="nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save
        </button>
      </div>

      <div className="section-title">Recent activity</div>
      <div className="list-card">
        {account.recent_transactions.map((t) => (
          <div className="txn-row" key={t.id}>
            <CategoryIcon name={t.category_name} />
            <div className="txn-meta">
              <div className="name">{t.display_name}</div>
              <div className="sub">
                {t.date}
                {t.category_name ? ` · ${t.category_name}` : ""}
              </div>
            </div>
            <div className={`txn-amount${Number(t.amount) >= 0 ? " in" : ""}`}>
              {formatMoney(t.amount, t.currency)}
            </div>
          </div>
        ))}
        {account.recent_transactions.length === 0 && (
          <p style={{ padding: 24 }} className="muted">
            No transactions on this account yet.
          </p>
        )}
      </div>
    </AppShell>
  );
}
