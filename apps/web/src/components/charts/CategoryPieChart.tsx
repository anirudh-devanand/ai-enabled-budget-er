"use client";

import { motion, useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { NamedAmount } from "@woney/api-client";
import { formatMoney } from "@/lib/ui";
import { CATEGORY_PIE_PALETTE, chartColors } from "./chartTheme";

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX_SLICES = 10;

type Slice = {
  name: string;
  amount: number;
  fill: string;
  pct: number;
};

function buildSlices(data: NamedAmount[]): Slice[] {
  const sorted = [...data]
    .map((d) => ({ name: d.name, amount: Math.abs(Number(d.amount)) }))
    .filter((d) => d.amount > 0 && Number.isFinite(d.amount))
    .sort((a, b) => b.amount - a.amount);

  if (sorted.length === 0) return [];

  const top = sorted.slice(0, MAX_SLICES - 1);
  const rest = sorted.slice(MAX_SLICES - 1);
  const rows =
    rest.length > 1
      ? [
          ...top,
          {
            name: "Other",
            amount: rest.reduce((sum, r) => sum + r.amount, 0),
          },
        ]
      : [...top, ...rest];

  const total = rows.reduce((sum, r) => sum + r.amount, 0) || 1;
  return rows.map((r, i) => ({
    name: r.name,
    amount: r.amount,
    fill: CATEGORY_PIE_PALETTE[i % CATEGORY_PIE_PALETTE.length],
    pct: (r.amount / total) * 100,
  }));
}

export function CategoryPieChart({
  data,
  currency = "CAD",
  emptyLabel,
}: {
  data: NamedAmount[];
  currency?: string;
  emptyLabel: string;
}) {
  const reduce = useReducedMotion();
  const colors = chartColors();
  const slices = buildSlices(data);
  const chartKey = slices.map((s) => `${s.name}:${s.amount}`).join("|");

  if (slices.length === 0) {
    return <p className="muted pie-empty">{emptyLabel}</p>;
  }

  return (
    <motion.div
      key={chartKey}
      className="pie-chart"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
    >
      <div className="pie-chart-plot" aria-hidden>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={96}
              paddingAngle={1.5}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={!reduce}
              animationDuration={reduce ? 0 : 650}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--text)",
              }}
              formatter={(value, _name, item) => {
                const amount = Number(value ?? 0);
                const pct = Number(item?.payload?.pct ?? 0);
                return [
                  `${formatMoney(amount, currency)} (${pct.toFixed(1)}%)`,
                  "Spent",
                ];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="pie-legend" aria-label="Spending by category">
        {slices.map((s) => (
          <li key={s.name}>
            <span className="pie-swatch" style={{ background: s.fill }} aria-hidden />
            <span className="pie-legend-name">{s.name}</span>
            <span className="pie-legend-meta" style={{ color: colors.muted }}>
              {formatMoney(s.amount, currency)}
              <span className="pie-legend-pct"> · {s.pct.toFixed(1)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
