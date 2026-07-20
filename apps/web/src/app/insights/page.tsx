"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { NamedAmount, NetWorthResponse } from "@ledger/api-client";
import { api } from "@/lib/api";

function money(amount: string, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(amount));
}

export default function InsightsPage() {
  const router = useRouter();
  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null);
  const [spending, setSpending] = useState<NamedAmount[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id;
        if (!hid) return;
        const [nw, cats] = await Promise.all([
          api.getNetWorth(hid),
          api.getSpendingByCategory(hid, 30),
        ]);
        setNetWorth(nw);
        setSpending(cats);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  const max = Math.max(...spending.map((s) => Number(s.amount)), 1);

  return (
    <div className="shell">
      <header>
        <h1>Insights</h1>
        <button onClick={() => router.push("/dashboard")}>Dashboard</button>
      </header>

      <div className="grid">
        <div className="tile">
          <h2>Net worth</h2>
          <p style={{ fontSize: "1.6rem", color: "var(--text)", marginTop: 8 }}>
            {netWorth ? money(netWorth.total, netWorth.currency) : "—"}
          </p>
        </div>
      </div>

      <h2 style={{ marginTop: 32, fontSize: "1.05rem" }}>Spending by category (30 days)</h2>
      <div className="tile" style={{ marginTop: 12 }}>
        {spending.length === 0 && (
          <p style={{ color: "var(--muted)" }}>No categorized spending yet.</p>
        )}
        {spending.map((s) => (
          <div key={s.name} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span>{s.name}</span>
              <span>{money(s.amount)}</span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(Number(s.amount) / max) * 100}%`,
                  background: "var(--accent)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
