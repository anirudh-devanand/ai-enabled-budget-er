"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { GoalResponse, GoalType, PlanResponse } from "@woney/api-client";
import { GoalRing } from "@/components/charts/GoalRing";
import { FadeIn } from "@/components/MotionEnter";
import { GoalsSkeleton } from "@/components/Skeleton";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "save", label: "Save" },
  { value: "emergency_fund", label: "Emergency fund" },
  { value: "debt_payoff", label: "Debt payoff" },
  { value: "custom", label: "Custom" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function GoalsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanResponse>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("Emergency fund");
  const [type, setType] = useState<GoalType>("emergency_fund");
  const [target, setTarget] = useState("5000");
  const [current, setCurrent] = useState("0");
  const [startDate, setStartDate] = useState(todayISO());
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");
  const [contributeAmt, setContributeAmt] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  async function refresh(hid: string) {
    setGoals(await api.listGoals(hid));
  }

  const reload = useCallback(async () => {
    if (householdId) await refresh(householdId);
  }, [householdId]);

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (hid) await refresh(hid);
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
      } finally {
        setReady(true);
      }
    })();
  }, [router]);

  async function create() {
    if (!householdId) return;
    setBusy(true);
    setError(null);
    try {
      await api.createGoal(householdId, name, target, targetDate || undefined, {
        type,
        current_amount: current || "0",
        start_date: startDate || null,
        notes: notes || null,
        priority,
      });
      await refresh(householdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal");
    } finally {
      setBusy(false);
    }
  }

  async function build(goalId: string) {
    setBusy(true);
    setError(null);
    try {
      const plan = await api.buildPlan(goalId);
      setPlans((p) => ({ ...p, [goalId]: plan }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build plan");
    } finally {
      setBusy(false);
    }
  }

  async function contribute(goalId: string) {
    const amount = contributeAmt[goalId]?.trim();
    if (!amount || !householdId) return;
    setBusy(true);
    setError(null);
    try {
      await api.contributeToGoal(goalId, amount);
      setContributeAmt((m) => ({ ...m, [goalId]: "" }));
      await refresh(householdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contribution failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(goalId: string, status: "active" | "paused" | "completed") {
    if (!householdId) return;
    setBusy(true);
    try {
      await api.updateGoal(goalId, { status });
      await refresh(householdId);
    } finally {
      setBusy(false);
    }
  }

  async function remove(goalId: string) {
    if (!householdId || !confirm("Delete this goal?")) return;
    setBusy(true);
    try {
      await api.deleteGoal(goalId);
      setPlans((p) => {
        const next = { ...p };
        delete next[goalId];
        return next;
      });
      await refresh(householdId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell householdId={householdId} onRefresh={reload}>
      <div className="page-header">
        <div>
          <h1>Goals</h1>
          <p>Set a target and timeline. Woney plans the path from your real cash flow.</p>
        </div>
      </div>

      {error && (
        <div className="toast" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!ready ? (
        <GoalsSkeleton />
      ) : (
      <FadeIn>
      <div className="tile goal-form">
        <h2>New goal</h2>
        <div className="goal-form-grid">
          <div className="field">
            <label htmlFor="gname">Name</label>
            <input id="gname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="gtype">Type</label>
            <select
              id="gtype"
              value={type}
              onChange={(e) => setType(e.target.value as GoalType)}
            >
              {GOAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
          <div className="field">
            <label htmlFor="gcurrent">Current amount</label>
            <input
              id="gcurrent"
              inputMode="decimal"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="gstart">Start date</label>
            <input
              id="gstart"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="gdeadline">Target date</label>
            <input
              id="gdeadline"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="gpriority">Priority</label>
            <select
              id="gpriority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="gnotes">Notes</label>
            <textarea
              id="gnotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this goal matters…"
            />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
          Create goal
        </button>
      </div>

      <div className="goals-grid">
        {goals.length === 0 && (
          <p className="muted">No goals yet — create one to track progress.</p>
        )}
        {goals.map((g) => {
          const plan = plans[g.id];
          const track =
            g.on_track == null
              ? null
              : g.on_track
                ? "On track"
                : "Behind";
          return (
            <div className="tile goal-card" key={g.id}>
              <div className="goal-card-top">
                <div>
                  <div className="goal-meta">
                    <span className="pill">{g.type.replace("_", " ")}</span>
                    <span className="pill muted-pill">{g.priority}</span>
                    <span className="pill muted-pill">{g.status}</span>
                    {track && (
                      <span className={`pill ${g.on_track ? "ok-pill" : "warn-pill"}`}>
                        {track}
                      </span>
                    )}
                  </div>
                  <h2>{g.name}</h2>
                  {g.notes && <p className="muted goal-notes">{g.notes}</p>}
                </div>
                <GoalRing pct={g.progress_pct ?? 0} />
              </div>

              <div className="amount">
                {formatMoney(g.current_amount, g.currency)}
                <span className="goal-target">
                  {" "}
                  / {formatMoney(g.target_amount, g.currency)}
                </span>
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                Remaining {formatMoney(g.remaining, g.currency)}
                {g.monthly_needed
                  ? ` · need ${formatMoney(g.monthly_needed, g.currency)}/mo`
                  : ""}
              </p>

              <div className="goal-timeline">
                <div className="goal-timeline-track">
                  <span className="dot start" />
                  <span className="dot today" />
                  <span className="dot end" />
                </div>
                <div className="goal-timeline-labels">
                  <span>{g.start_date || "Start"}</span>
                  <span>Today</span>
                  <span>
                    {g.target_date || "No deadline"}
                    {g.days_left != null
                      ? g.days_left >= 0
                        ? ` · ${g.days_left}d left`
                        : ` · ${Math.abs(g.days_left)}d overdue`
                      : ""}
                  </span>
                </div>
              </div>

              <div className="goal-contribute">
                <input
                  inputMode="decimal"
                  placeholder="Add contribution"
                  value={contributeAmt[g.id] ?? ""}
                  onChange={(e) =>
                    setContributeAmt((m) => ({ ...m, [g.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => contribute(g.id)}
                >
                  Contribute
                </button>
              </div>

              <div className="goal-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => build(g.id)}
                >
                  Build plan
                </button>
                {g.status === "active" ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => setStatus(g.id, "paused")}
                  >
                    Pause
                  </button>
                ) : g.status === "paused" ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => setStatus(g.id, "active")}
                  >
                    Resume
                  </button>
                ) : null}
                {g.status !== "completed" && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => setStatus(g.id, "completed")}
                  >
                    Complete
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => remove(g.id)}
                >
                  Delete
                </button>
              </div>

              {plan && (
                <div className="goal-plan">
                  <h3>Plan</h3>
                  <p>{plan.summary}</p>
                  <p className="muted">
                    Need {formatMoney(plan.monthly_surplus_needed)}/month
                    {plan.projected_completion
                      ? ` · finish by ${plan.projected_completion}`
                      : ""}
                  </p>
                  <ul>
                    {plan.items.map((i) => (
                      <li key={i.id}>
                        <strong>{i.action}</strong>: {formatMoney(i.amount)} — {i.rationale}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </FadeIn>
      )}
    </AppShell>
  );
}
