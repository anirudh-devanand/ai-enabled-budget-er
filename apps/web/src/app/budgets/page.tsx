"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BudgetDetailResponse, CategoryResponse } from "@woney/api-client";
import { FadeIn, Stagger, StaggerItem } from "@/components/MotionEnter";
import { BudgetsSkeleton } from "@/components/Skeleton";
import { AppShell, CategoryIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

export default function BudgetsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetDetailResponse | null>(null);
  const [catNames, setCatNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [households, cats] = await Promise.all([
      api.listHouseholds(),
      api.listCategories(),
    ]);
    const hid = households[0]?.id ?? null;
    setHouseholdId(hid);
    setCatNames(Object.fromEntries(cats.map((c: CategoryResponse) => [c.id, c.name])));
    if (!hid) {
      setBudget(null);
      return;
    }
    const list = await api.listBudgets(hid);
    if (list[0]) setBudget(await api.getBudget(list[0].id));
    else setBudget(null);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => {
        if (isUnauthorized(err)) router.replace("/login");
      })
      .finally(() => setReady(true));
  }, [load, router]);

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
    <AppShell householdId={householdId} onRefresh={load}>
      <div className="page-header">
        <div>
          <h1>Budgets</h1>
          <p>Targets that follow your real spending — adjustable anytime.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={propose} disabled={busy}>
            {busy ? "Working…" : "Propose from history"}
          </button>
        </div>
      </div>

      {!ready ? (
        <BudgetsSkeleton />
      ) : !budget ? (
        <FadeIn>
          <div className="tile">
            <h2>No budget yet</h2>
            <div className="hint" style={{ marginTop: 10 }}>
              Propose one from recent spending, then tweak the targets that matter.
            </div>
          </div>
        </FadeIn>
      ) : (
        <FadeIn>
          <p className="muted" style={{ marginTop: 0 }}>
            {budget.name} · {budget.mode}
            {budget.period_start ? ` · ${budget.period_start} → ${budget.period_end}` : ""}
          </p>
          <Stagger className="list-card">
            {budget.categories.map((c) => {
              const name = catNames[c.category_id] ?? "Category";
              const over = Number(c.remaining) < 0;
              return (
                <StaggerItem key={c.category_id}>
                  <div className="txn-row">
                    <CategoryIcon name={name} />
                    <div className="txn-meta">
                      <div className="name">{name}</div>
                      <div className="sub">
                        {formatMoney(c.actual)} of {formatMoney(c.target)}
                      </div>
                    </div>
                    <span className={`badge${over ? " badge-warn" : ""}`}>
                      {over ? "Over" : `${formatMoney(c.remaining)} left`}
                    </span>
                  </div>
                </StaggerItem>
              );
            })}
            {budget.categories.length === 0 && (
              <p style={{ padding: 24 }} className="muted">
                No category targets yet.
              </p>
            )}
          </Stagger>
        </FadeIn>
      )}
    </AppShell>
  );
}
