"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BudgetDetailResponse } from "@ledger/api-client";
import { api } from "@/lib/api";

function money(amount: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    Number(amount),
  );
}

export default function BudgetsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetDetailResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) return;
        const list = await api.listBudgets(hid);
        if (list[0]) setBudget(await api.getBudget(list[0].id));
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  async function propose() {
    if (!householdId) return;
    setBusy(true);
    try {
      const created = await api.createBudget(householdId, {
        propose: true,
        name: "Suggested budget",
      });
      setBudget(await api.getBudget(created.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header>
        <h1>Budgets</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={propose} disabled={busy}>
            {busy ? "Working…" : "Propose from history"}
          </button>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
        </div>
      </header>

      {!budget && (
        <div className="tile">
          <h2>No budget yet</h2>
          <p>Propose one from your recent spending, then tweak targets.</p>
        </div>
      )}

      {budget && (
        <>
          <p style={{ color: "var(--muted)" }}>
            {budget.name} · {budget.mode}
            {budget.period_start ? ` · ${budget.period_start} → ${budget.period_end}` : ""}
          </p>
          <div className="tile" style={{ padding: 0 }}>
            {budget.categories.map((c) => (
              <div
                key={c.category_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--muted)" }}>{c.category_id.slice(0, 8)}…</span>
                <span>
                  {money(c.actual)} / {money(c.target)}
                  <span className="badge" style={{ marginLeft: 10, marginTop: 0 }}>
                    {Number(c.remaining) >= 0 ? `${money(c.remaining)} left` : "over"}
                  </span>
                </span>
              </div>
            ))}
            {budget.categories.length === 0 && (
              <p style={{ padding: 20, color: "var(--muted)" }}>No category targets yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
