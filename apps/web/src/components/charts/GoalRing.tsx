"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function GoalRing({
  pct,
  size = 120,
  stroke = 10,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="goal-ring"
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--text)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        initial={reduce ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--text)"
        style={{ fontSize: size * 0.18, fontWeight: 700, fontFamily: "inherit" }}
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
