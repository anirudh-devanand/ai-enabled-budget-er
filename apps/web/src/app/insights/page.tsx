"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  CashFlowPoint,
  NamedAmount,
  NetWorthResponse,
  PeriodSummary,
} from "@woney/api-client";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { chartColors } from "@/components/charts/chartTheme";
import { FadeIn } from "@/components/MotionEnter";
import { Segmented } from "@/components/Segmented";
import { InsightsSkeleton } from "@/components/Skeleton";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

const RANGES = [30, 90, 365] as const;
type RangeDays = (typeof RANGES)[number];

export default function InsightsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [days, setDays] = useState<RangeDays>(30);
  const [netWorth, setNetWorth] = useState<NetWorthResponse | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowPoint[]>([]);
  const [spending, setSpending] = useState<NamedAmount[]>([]);
  const [income, setIncome] = useState<NamedAmount[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const colors = chartColors();

  const load = useCallback(async () => {
    const households = await api.listHouseholds();
    const hid = households[0]?.id ?? null;
    setHouseholdId(hid);
    if (!hid) {
      setLoading(false);
      setHasLoaded(true);
      return;
    }
    setLoading(true);
    try {
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
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [days]);

  useEffect(() => {
    load().catch((err) => {
      if (isUnauthorized(err)) router.replace("/login");
      else {
        setLoading(false);
        setHasLoaded(true);
      }
    });
  }, [load, router]);

  const showSkeleton = loading && !hasLoaded;

  return (
    <AppShell householdId={householdId} onRefresh={load}>
      <div className="page-header">
        <div>
          <h1>Insights</h1>
          <p>Numbers from your linked accounts — Woney never invents the math.</p>
        </div>
        <Segmented<`${RangeDays}`>
          aria-label="Period"
          layoutId="insights-period-pill"
          value={`${days}`}
          onChange={(v) => setDays(Number(v) as RangeDays)}
          options={RANGES.map((d) => ({
            value: `${d}` as `${RangeDays}`,
            label: d === 365 ? "1y" : `${d}d`,
          }))}
        />
      </div>

      {showSkeleton ? (
        <InsightsSkeleton />
      ) : (
        loading && hasLoaded ? (
          <InsightsSkeleton />
        ) : (
          <FadeIn key={days}>
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
          </FadeIn>
        )
      )}
    </AppShell>
  );
}
