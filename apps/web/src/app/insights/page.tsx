"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  CashFlowPoint,
  NamedAmount,
  NetWorthResponse,
  PeriodSummary,
} from "@woney/api-client";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { chartColors } from "@/components/charts/chartTheme";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

const RANGES = [30, 90, 365] as const;

export default function InsightsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowPoint[]>([]);
  const [spending, setSpending] = useState<NamedAmount[]>([]);
  const [income, setIncome] = useState<NamedAmount[]>([]);
  const [loading, setLoading] = useState(true);
  const colors = chartColors();

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) {
          setLoading(false);
          return;
        }
        setLoading(true);
        const [nw, sum, flow, spend, inc] = await Promise.all([
          api.getNetWorth(hid),
          api.getPeriodSummary(hid, days),
          api.getCashFlow(hid, days),
          api.getSpendingByCategory(hid, days),
          api.getIncomeByCategory(hid, days),
        ]);
        setNetWorth(nw);
        setSummary(sum);
        setCashFlow(flow);
        setSpending(spend);
        setIncome(inc);
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, days]);

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Insights</h1>
          <p>Numbers from your linked accounts — Woney never invents the math.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Period">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              className={days === d ? "active" : undefined}
              onClick={() => setDays(d)}
            >
              {d === 365 ? "1y" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      <div className="insight-summary">
        <div className="insight-stat">
          <div className="label">Income</div>
          <div className="amount positive">
            {summary ? formatMoney(summary.income_total, summary.currency) : "—"}
          </div>
        </div>
        <div className="insight-stat">
          <div className="label">Spending</div>
          <div className="amount">
            {summary ? formatMoney(summary.spending_total, summary.currency) : "—"}
          </div>
        </div>
        <div className="insight-stat">
          <div className="label">Net</div>
          <div className="amount">
            {summary ? formatMoney(summary.net, summary.currency) : "—"}
          </div>
        </div>
        <div className="insight-stat">
          <div className="label">Net worth</div>
          <div className="amount">
            {netWorth ? formatMoney(netWorth.total, netWorth.currency) : "—"}
          </div>
        </div>
      </div>

      {loading && <p className="muted">Updating charts…</p>}

      <div className="tile chart-tile">
        <h2>Cash flow</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Income vs spending over the last {days} days.
        </p>
        <CashFlowChart data={cashFlow} />
      </div>

      <div className="insight-split">
        <div className="tile chart-tile">
          <h2>Spending by category</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Where money went this period.
          </p>
          <CategoryBars
            data={spending}
            color={colors.spending}
            emptyLabel="No categorized spending yet — link a bank or wait for sync."
          />
        </div>
        <div className="tile chart-tile">
          <h2>Income by category</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Paycheques, transfers, and other inflows.
          </p>
          <CategoryBars
            data={income}
            color={colors.income}
            emptyLabel="No categorized income yet."
          />
        </div>
      </div>
    </AppShell>
  );
}
