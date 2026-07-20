"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  AccountResponse,
  HouseholdResponse,
  TransactionResponse,
  UserResponse,
} from "@ledger/api-client";
import { api } from "@/lib/api";

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(amount));
}

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
        api.listTransactions(first.id, 15),
      ]);
      setAccounts(accs);
      setTransactions(txns.items);
    }
  }, []);

  useEffect(() => {
    load().catch(() => router.replace("/login"));
  }, [load, router]);

  async function logout() {
    await api.logout();
    router.replace("/login");
  }

  if (!user) return null;

  const netBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  return (
    <div className="shell">
      <header>
        <h1>Welcome back, {user.display_name}</h1>
        <div style={{ display: "flex", gap: 10 }}>
          {household && (
            <button onClick={() => router.push(`/connect?household=${household.id}`)}>
              Connect a bank
            </button>
          )}
          <button onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="grid">
        <div className="tile">
          <h2>Total balance</h2>
          <p style={{ fontSize: "1.6rem", color: "var(--text)", marginTop: 6 }}>
            {formatMoney(String(netBalance), accounts[0]?.currency ?? "CAD")}
          </p>
          <span className="badge">
            {accounts.length} account{accounts.length === 1 ? "" : "s"} linked
          </span>
        </div>
        {accounts.map((a) => (
          <div className="tile" key={a.id}>
            <h2>{a.name}</h2>
            <p>
              {a.type}
              {a.masked_number ? ` ****${a.masked_number}` : ""}
            </p>
            <p style={{ fontSize: "1.2rem", color: "var(--text)", marginTop: 8 }}>
              {formatMoney(a.balance, a.currency)}
            </p>
          </div>
        ))}
        {accounts.length === 0 && household && (
          <div className="tile">
            <h2>{household.name}</h2>
            <p>Connect a bank to start syncing transactions.</p>
            <span className="badge">No accounts linked yet</span>
          </div>
        )}
      </div>

      {transactions.length > 0 && (
        <>
          <h2 style={{ marginTop: 36, fontSize: "1.05rem" }}>Recent transactions</h2>
          <div className="tile" style={{ marginTop: 12, padding: 0 }}>
            {transactions.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--muted)", flexShrink: 0 }}>{t.date}</span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flexGrow: 1,
                  }}
                >
                  {t.raw_description}
                </span>
                <span
                  style={{
                    color: Number(t.amount) >= 0 ? "#4fc37f" : "var(--text)",
                    flexShrink: 0,
                  }}
                >
                  {formatMoney(t.amount, t.currency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
