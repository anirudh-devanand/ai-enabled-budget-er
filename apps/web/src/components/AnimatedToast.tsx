"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Enter/exit toast that keeps existing `.toast` / chrome styling. */
export function AnimatedToast({
  message,
  className,
}: {
  message: string | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const classes = ["toast", className].filter(Boolean).join(" ");

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          key={message}
          className={classes}
          role="status"
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
