"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GoalResponse, PlanResponse } from "@ledger/api-client";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

export default function GoalsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [name, setName] = useState("Emergency fund");
  const [target, setTarget] = useState("5000");
  const [busy, setBusy] = useState(false);

  async function refresh(hid: string) {
    setGoals(await api.listGoals(hid));
  }

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (hid) await refresh(hid);
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
      }
    })();
  }, [router]);

  async function create() {
    if (!householdId) return;
    setBusy(true);
    try {
      await api.createGoal(householdId, name, target);
      await refresh(householdId);
    } finally {
      setBusy(false);
    }
  }

  async function build(goalId: string) {
    setBusy(true);
    try {
      setPlan(await api.buildPlan(goalId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Goals</h1>
          <p>Set a target. Woney plans the path from your real cash flow.</p>
        </div>
      </div>

      <div className="tile" style={{ marginBottom: 20, maxWidth: 480 }}>
        <h2>New goal</h2>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="gname">Name</label>
          <input id="gname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="gtarget">Target amount</label>
          <input
            id="gtarget"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
          Create goal
        </button>
      </div>

      <div className="grid">
        {goals.map((g) => {
          const pct = Math.min(
            100,
            (Number(g.current_amount) / Math.max(Number(g.target_amount), 1)) * 100,
          );
          return (
            <div className="tile" key={g.id}>
              <h2>{g.name}</h2>
              <div className="amount">
                {formatMoney(g.current_amount)}
                <span style={{ color: "var(--muted)", fontSize: "0.9rem", fontWeight: 600 }}>
                  {" "}
                  / {formatMoney(g.target_amount)}
                </span>
              </div>
              <div
                style={{
                  marginTop: 12,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 14 }}
                onClick={() => build(g.id)}
                disabled={busy}
              >
                Build plan
              </button>
            </div>
          );
        })}
      </div>

      {plan && (
        <div className="tile" style={{ marginTop: 24 }}>
          <h2>Plan</h2>
          <p style={{ marginTop: 10 }}>{plan.summary}</p>
          <p className="muted">
            Need {formatMoney(plan.monthly_surplus_needed)}/month
            {plan.projected_completion ? ` · finish by ${plan.projected_completion}` : ""}
          </p>
          <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
            {plan.items.map((i) => (
              <li key={i.id} style={{ marginBottom: 6 }}>
                <strong>{i.action}</strong>: {formatMoney(i.amount)} — {i.rationale}
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
