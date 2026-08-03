"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { useEffect, useRef } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;
const REST_X = 50;
const REST_Y = 46;

/** Ascending ledger marks — abstract balance trend, not a real chart. */
const MARKS = [
  { h: 36, delay: 0 },
  { h: 54, delay: 0.12 },
  { h: 44, delay: 0.22 },
  { h: 72, delay: 0.34 },
  { h: 92, delay: 0.46 },
] as const;

/** Full-page brand splash while auth / session bootstrap. */
export function WoneyLoader({ label = "Loading" }: { label?: string }) {
  const reduce = useReducedMotion();
  const markRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);

  const x = useMotionValue(REST_X);
  const y = useMotionValue(REST_Y);
  const springX = useSpring(x, { stiffness: 140, damping: 26, mass: 0.7 });
  const springY = useSpring(y, { stiffness: 140, damping: 26, mass: 0.7 });
  const glowLeft = useMotionTemplate`${springX}%`;
  const glowTop = useMotionTemplate`${springY}%`;

  // Idle drift when pointer is away — keeps the mark alive on mobile / no hover.
  useEffect(() => {
    if (reduce) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      if (!hovering.current) {
        const t = (now - start) / 1000;
        x.set(REST_X + Math.sin(t * 0.55) * 5);
        y.set(REST_Y + Math.cos(t * 0.42) * 4);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, x, y]);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const el = markRef.current;
    if (!el) return;
    hovering.current = true;
    const rect = el.getBoundingClientRect();
    const nextX = ((e.clientX - rect.left) / rect.width) * 100;
    const nextY = ((e.clientY - rect.top) / rect.height) * 100;
    x.set(Math.min(100, Math.max(0, nextX)));
    y.set(Math.min(100, Math.max(0, nextY)));
  }

  function onPointerLeave() {
    hovering.current = false;
    if (reduce) return;
    x.set(REST_X);
    y.set(REST_Y);
  }

  return (
    <div className="woney-loader" role="status" aria-live="polite" aria-label={label}>
      <motion.div
        className="woney-loader-inner"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
      >
        <div
          ref={markRef}
          className="woney-loader-mark"
          aria-hidden
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <motion.span
            className="woney-loader-glow"
            style={
              reduce
                ? { left: `${REST_X}%`, top: `${REST_Y}%` }
                : { left: glowLeft, top: glowTop }
            }
          >
            {!reduce ? (
              <motion.span
                className="woney-loader-glow-core"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.42, 0.88, 0.42],
                }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
            ) : (
              <span className="woney-loader-glow-core" />
            )}
          </motion.span>

          <motion.span
            className="woney-loader-word"
            animate={
              reduce
                ? undefined
                : {
                    opacity: [0.88, 1, 0.88],
                  }
            }
            transition={
              reduce
                ? undefined
                : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
            }
            whileHover={reduce ? undefined : { scale: 1.03 }}
          >
            Woney
          </motion.span>

          <div
            className={
              reduce
                ? "woney-loader-motif woney-loader-motif-static"
                : "woney-loader-motif"
            }
          >
            <div className="woney-loader-ledger">
              {MARKS.map((m, i) =>
                reduce ? (
                  <span
                    key={i}
                    className="woney-loader-bar"
                    style={{ height: m.h }}
                  />
                ) : (
                  <motion.span
                    key={i}
                    className="woney-loader-bar"
                    style={{ height: m.h }}
                    animate={{
                      scaleY: [0.55, 1, 0.72, 1],
                      opacity: [0.35, 0.85, 0.5, 0.85],
                    }}
                    transition={{
                      duration: 3.6,
                      delay: m.delay,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )
              )}
            </div>

            {!reduce ? (
              <svg
                className="woney-loader-line"
                viewBox="0 0 220 22"
                fill="none"
                aria-hidden
              >
                <motion.path
                  d="M4 17.5 C 34 17.5, 42 6, 72 6.5 C 98 7, 106 15, 136 12.5 C 164 10, 174 4, 216 4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: [0, 1, 1, 0],
                    opacity: [0, 0.8, 0.55, 0],
                  }}
                  transition={{
                    duration: 4.2,
                    repeat: Infinity,
                    ease: EASE,
                    times: [0, 0.45, 0.75, 1],
                  }}
                />
              </svg>
            ) : (
              <span className="woney-loader-line-static" />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
