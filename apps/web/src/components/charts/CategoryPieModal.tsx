"use client";

import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { NamedAmount } from "@woney/api-client";
import { Skeleton, SkeletonChart } from "@/components/Skeleton";
import { CategoryPieChart } from "./CategoryPieChart";

const EASE = [0.22, 1, 0.36, 1] as const;

export function CategoryPieModal({
  open,
  onClose,
  data,
  days,
  currency = "CAD",
  loading = false,
  error = null,
}: {
  open: boolean;
  onClose: () => void;
  data: NamedAmount[];
  days: number;
  currency?: string;
  loading?: boolean;
  error?: string | null;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const periodLabel = days === 365 ? "the last year" : `the last ${days} days`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="category-pie-overlay"
          className="reauth-overlay pie-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="reauth-dialog card pie-modal-dialog"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 10 }}
            transition={{ duration: reduce ? 0 : 0.26, ease: EASE }}
          >
            <div className="pie-modal-header">
              <div>
                <h2 id={titleId}>Spending by category</h2>
                <p className="sub pie-modal-sub">
                  Share of spending for {periodLabel}.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="btn btn-icon pie-modal-close"
                aria-label="Close category breakdown"
                onClick={onClose}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {loading ? (
              <div
                className="pie-modal-loading"
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label="Loading category breakdown"
              >
                <SkeletonChart height={220} />
                <div className="pie-modal-loading-rows">
                  {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} width="100%" height={14} radius={6} />
                  ))}
                </div>
              </div>
            ) : error ? (
              <p className="error pie-modal-error" role="alert">
                {error}
              </p>
            ) : (
              <CategoryPieChart
                data={data}
                currency={currency}
                emptyLabel="No categorized spending yet — link a bank or wait for sync."
              />
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
