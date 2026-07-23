"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { NamedAmount, NetWorthResponse } from "@ledger/api-client";
import { AppShell, CategoryIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

export default function InsightsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null);
  const [spending, setSpending] = useState<NamedAmount[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) return;
        const [nw, cats] = await Promise.all([
          api.getNetWorth(hid),
          api.getSpendingByCategory(hid, 30),
        ]);
        setNetWorth(nw);
        setSpending(cats);
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
      }
    })();
  }, [router]);

  const max = Math.max(...spending.map((s) => Number(s.amount)), 1);

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Insights</h1>
          <p>A calm view of where your money sits and where it goes.</p>
        </div>
      </div>

      <div className="hero-balance">
        <div className="label">Net worth</div>
        <div className="amount">
          {netWorth ? formatMoney(netWorth.total, netWorth.currency) : "—"}
        </div>
        <div className="meta">All linked accounts · CAD</div>
      </div>

      <div className="section-title">Spending by category · 30 days</div>
      <div className="list-card">
        {spending.length === 0 && (
          <p style={{ padding: 24 }} className="muted">
            No categorized spending yet — link a bank or wait for sync.
          </p>
        )}
        {spending.map((s) => (
          <div className="txn-row" key={s.name}>
            <CategoryIcon name={s.name} />
            <div className="txn-meta">
              <div className="name">{s.name}</div>
              <div
                style={{
                  marginTop: 8,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--border)",
                  overflow: "hidden",
                  maxWidth: 280,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(Number(s.amount) / max) * 100}%`,
                    background: "var(--accent)",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
            <div className="txn-amount">{formatMoney(s.amount)}</div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
