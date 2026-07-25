"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashFlowPoint } from "@woney/api-client";
import { formatMoney } from "@/lib/ui";
import { chartColors } from "./chartTheme";

function rollupWeekly(points: CashFlowPoint[]) {
  if (points.length <= 45) {
    return points.map((p) => ({
      label: p.date.slice(5),
      income: Number(p.income),
      spending: Number(p.spending),
    }));
  }
  const buckets = new Map<string, { income: number; spending: number }>();
  for (const p of points) {
    const d = new Date(p.date + "T12:00:00");
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    const cur = buckets.get(key) ?? { income: 0, spending: 0 };
    cur.income += Number(p.income);
    cur.spending += Number(p.spending);
    buckets.set(key, cur);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({
      label: key.slice(5),
      income: v.income,
      spending: v.spending,
    }));
}

export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const colors = chartColors();
  const rows = rollupWeekly(data);
  if (rows.length === 0) {
    return <p className="muted">No cash-flow data for this period yet.</p>;
  }
  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: colors.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${Math.round(Number(v) / 100) * 100}`}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--text)",
            }}
            formatter={(value) => formatMoney(String(Number(value ?? 0)))}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke={colors.income}
            fill={colors.income}
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="spending"
            name="Spending"
            stroke={colors.spending}
            fill={colors.spending}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
