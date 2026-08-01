"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useEffect, useRef } from "react";
import { ENTER_EASE } from "@/components/MotionEnter";

type Props = {
  headline: string;
  lede: string;
  footer?: string;
};

const REST_X = 70;
const REST_Y = 85;

/** Dark brand panel with a soft gold glow that follows the pointer. */
export function AuthBrand({ headline, lede, footer = "Built for Canada." }: Props) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const hovering = useRef(false);

  const x = useMotionValue(REST_X);
  const y = useMotionValue(REST_Y);
  const springX = useSpring(x, { stiffness: 140, damping: 26, mass: 0.7 });
  const springY = useSpring(y, { stiffness: 140, damping: 26, mass: 0.7 });
  const glowLeft = useMotionTemplate`${springX}%`;
  const glowTop = useMotionTemplate`${springY}%`;

  // Gentle idle drift when the pointer is away — keeps the panel alive without fighting follow.
  useEffect(() => {
    if (reduce) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      if (!hovering.current) {
        const t = (now - start) / 1000;
        x.set(REST_X + Math.sin(t * 0.55) * 4.5);
        y.set(REST_Y + Math.cos(t * 0.42) * 3.5);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, x, y]);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    if (reduce) return;
    const el = panelRef.current;
    if (!el) return;
    hovering.current = true;
    const rect = el.getBoundingClientRect();
    const nextX = ((e.clientX - rect.left) / rect.width) * 100;
    const nextY = ((e.clientY - rect.top) / rect.height) * 100;
    x.set(Math.min(100, Math.max(0, nextX)));
    y.set(Math.min(100, Math.max(0, nextY)));
  }

  function onLeave() {
    hovering.current = false;
    if (reduce) return;
    x.set(REST_X);
    y.set(REST_Y);
  }

  return (
    <section
      ref={panelRef}
      className="auth-brand"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {/* Outer: spring position. Inner: breathe scale — avoids fighting CSS translate(-50%,-50%). */}
      <motion.div
        className="auth-glow"
        aria-hidden
        style={
          reduce
            ? { left: `${REST_X}%`, top: `${REST_Y}%` }
            : { left: glowLeft, top: glowTop }
        }
      >
        <motion.div
          className="auth-glow-core"
          animate={
            reduce
              ? undefined
              : {
                  scale: [1, 1.06, 1],
                  opacity: [0.78, 1, 0.78],
                }
          }
          transition={
            reduce
              ? undefined
              : {
                  duration: 5.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      </motion.div>
      <motion.div
        className="logo"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: ENTER_EASE }}
      >
        Woney
      </motion.div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.06, ease: ENTER_EASE }}
      >
        <h2 className="headline">{headline}</h2>
        <p className="lede">{lede}</p>
      </motion.div>
      <motion.p
        className="lede"
        style={{ marginBottom: 0 }}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.12, ease: ENTER_EASE }}
      >
        {footer}
      </motion.p>
    </section>
  );
}
