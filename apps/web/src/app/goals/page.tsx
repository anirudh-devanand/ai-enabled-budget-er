"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GoalResponse, PlanResponse } from "@ledger/api-client";
import { api } from "@/lib/api";

function money(amount: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    Number(amount),
  );
}

export default function GoalsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalResponse[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [name, setName] = useState("Emergency fund");
  const [target, setTarget] = useState("5000");

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
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  async function create() {
    if (!householdId) return;
    await api.createGoal(householdId, name, target);
    await refresh(householdId);
  }

  async function build(goalId: string) {
    setPlan(await api.buildPlan(goalId));
  }

  return (
    <div className="shell">
      <header>
        <h1>Goals & planner</h1>
        <button onClick={() => router.push("/dashboard")}>Dashboard</button>
      </header>

      <div className="tile" style={{ marginBottom: 20 }}>
        <h2>New goal</h2>
        <label htmlFor="gname">Name</label>
        <input id="gname" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="gtarget">Target amount</label>
        <input id="gtarget" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="primary" onClick={create}>
          Create goal
        </button>
      </div>

      <div className="grid">
        {goals.map((g) => (
          <div className="tile" key={g.id}>
            <h2>{g.name}</h2>
            <p>
              {money(g.current_amount)} of {money(g.target_amount)}
            </p>
            <button
              className="primary"
              style={{ marginTop: 12 }}
              onClick={() => build(g.id)}
            >
              Build plan
            </button>
          </div>
        ))}
      </div>

      {plan && (
        <div className="tile" style={{ marginTop: 24 }}>
          <h2>Plan</h2>
          <p>{plan.summary}</p>
          <p style={{ color: "var(--muted)" }}>
            Need {money(plan.monthly_surplus_needed)}/month
            {plan.projected_completion ? ` · finish by ${plan.projected_completion}` : ""}
          </p>
          <ul>
            {plan.items.map((i) => (
              <li key={i.id}>
                {i.action}: {money(i.amount)} — {i.rationale}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
