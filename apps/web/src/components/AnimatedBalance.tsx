"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/ui";

/** Count-up money display; static when `prefers-reduced-motion`. */
export function AnimatedBalance({
  value,
  currency = "CAD",
  className,
}: {
  value: number;
  currency?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }

    const from = prev.current === null ? 0 : prev.current;
    prev.current = value;
    if (from === value) {
      setDisplay(value);
      return;
    }

    const controls = animate(from, value, {
      duration: 0.85,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <div className={className}>{formatMoney(display, currency)}</div>;
}
