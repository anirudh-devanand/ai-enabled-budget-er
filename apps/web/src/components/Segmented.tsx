"use client";

import { motion, useReducedMotion } from "motion/react";

type Option<T extends string> = {
  value: T;
  label: string;
};

/** Segmented control with a shared-element active pill (`layoutId`). */
export function Segmented<T extends string>({
  "aria-label": ariaLabel,
  layoutId,
  options,
  value,
  onChange,
}: {
  "aria-label": string;
  layoutId: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`seg-btn${active ? " active" : ""}${active && !reduce ? " has-motion-indicator" : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {active && !reduce ? (
              <motion.span
                layoutId={layoutId}
                className="seg-active-indicator"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <span className="seg-btn-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
