"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

export const ENTER_EASE = [0.22, 1, 0.36, 1] as const;

type FadeInProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** When false, skip enter (useful for re-renders). Default true. */
  animate?: boolean;
} & Omit<HTMLMotionProps<"div">, "children" | "initial" | "animate" | "transition">;

/** Subtle fade/slide enter — static when reduced-motion. */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 8,
  animate = true,
  ...rest
}: FadeInProps) {
  const reduce = useReducedMotion();
  const skip = reduce || !animate;

  return (
    <motion.div
      className={className}
      initial={skip ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: skip ? 0 : 0.28,
        delay: skip ? 0 : delay,
        ease: ENTER_EASE,
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
};

/** Parent for staggered children using CSS custom property timing via variants. */
export function Stagger({
  children,
  className,
  stagger = 0.045,
  delay = 0.04,
}: StaggerProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: reduce ? 0 : stagger,
            delayChildren: reduce ? 0 : delay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  y = 6,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: reduce ? 0 : 0.24, ease: ENTER_EASE },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
