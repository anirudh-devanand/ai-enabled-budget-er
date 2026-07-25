"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NamedAmount } from "@woney/api-client";
import { formatMoney } from "@/lib/ui";
import { chartColors } from "./chartTheme";

export function CategoryBars({
  data,
  color,
  emptyLabel,
}: {
  data: NamedAmount[];
  color?: string;
  emptyLabel: string;
}) {
  const colors = chartColors();
  const rows = [...data]
    .map((d) => ({
      name: d.name.length > 18 ? `${d.name.slice(0, 16)}…` : d.name,
      fullName: d.name,
      amount: Number(d.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  if (rows.length === 0) {
    return <p className="muted">{emptyLabel}</p>;
  }

  const height = Math.max(220, rows.length * 36);

  return (
    <div className="chart-frame">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
        >
          <CartesianGrid stroke={colors.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: colors.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${Math.round(Number(v))}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fill: colors.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              color: "var(--text)",
            }}
            formatter={(value) => formatMoney(String(Number(value ?? 0)))}
            labelFormatter={(_, payload) =>
              String(payload?.[0]?.payload?.fullName ?? "")
            }
          />
          <Bar
            dataKey="amount"
            name="Amount"
            fill={color ?? colors.accent}
            radius={[0, 6, 6, 0]}
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
