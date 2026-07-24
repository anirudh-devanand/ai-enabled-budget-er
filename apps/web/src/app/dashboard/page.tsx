"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  AccountResponse,
  HouseholdResponse,
  TransactionResponse,
  UserResponse,
} from "@woney/api-client";
import { BankLogo } from "@/components/BankLogo";
import { AppShell, CategoryIcon } from "@/components/ui";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [household, setHousehold] = useState<HouseholdResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);

  const load = useCallback(async () => {
    const [me, households] = await Promise.all([api.me(), api.listHouseholds()]);
    setUser(me);
    const first = households[0] ?? null;
    setHousehold(first);
    if (first) {
      const [accs, txns] = await Promise.all([
        api.listAccounts(first.id),
        api.listTransactions(first.id, 12),
      ]);
      setAccounts(accs);
      setTransactions(txns.items);
    }
  }, []);

  useEffect(() => {
    load().catch((err) => {
      if (isUnauthorized(err)) router.replace("/login");
    });
  }, [load, router]);

  if (!user) {
    return (
      <div className="app-main">
        <WoneyLoader label="Loading your accounts…" />
      </div>
    );
  }

  const netBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <AppShell householdId={household?.id}>
      <div className="page-header">
        <div>
          <h1>Hello, {user.display_name.split(" ")[0]}</h1>
          <p>Here’s where your money stands today.</p>
        </div>
      </div>

      <div className="hero-balance">
        <div className="label">Total balance</div>
        <div className="amount">
          {formatMoney(String(netBalance), accounts[0]?.currency ?? "CAD")}
        </div>
        <div className="meta">
          {accounts.length} account{accounts.length === 1 ? "" : "s"} · CAD
        </div>
      </div>

      <div className="grid">
        {accounts.map((a) => (
          <button
            type="button"
            className="account-card"
            key={a.id}
            onClick={() => router.push(`/accounts/${a.id}`)}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 4 }}>
              <BankLogo institutionName={a.institution_name || a.name} size={40} />
              <p className="label" style={{ margin: 0 }}>
                {a.display_name || a.name}
                {a.masked_number ? ` ····${a.masked_number}` : ""}
              </p>
            </div>
            <p className="amount">{formatMoney(a.balance, a.currency)}</p>
            <p className="meta">
              {a.type}
              {a.institution_name ? ` · ${a.institution_name}` : ""}
            </p>
          </button>
        ))}
        {accounts.length === 0 && household && (
          <div className="account-card">
            <p className="label">{household.name}</p>
            <p className="meta" style={{ marginTop: 12 }}>
              Link a bank in Account to see live balances.
            </p>
          </div>
        )}
      </div>

      {transactions.length > 0 && (
        <>
          <div className="section-title">Recent activity</div>
          <div className="list-card">
            {transactions.map((t) => (
              <div className="txn-row" key={t.id}>
                <CategoryIcon name={t.category_name} />
                <div className="txn-meta">
                  <div className="name">{t.display_name}</div>
                  <div className="sub">
                    {t.date}
                    {t.category_name ? ` · ${t.category_name}` : ""}
                    {t.needs_review ? " · needs review" : ""}
                  </div>
                </div>
                <div className={`txn-amount${Number(t.amount) >= 0 ? " in" : ""}`}>
                  {formatMoney(t.amount, t.currency)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
