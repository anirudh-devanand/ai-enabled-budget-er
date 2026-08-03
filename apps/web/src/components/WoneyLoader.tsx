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

const REST_X = 50;
const REST_Y = 58;

/** Full-page brand splash while auth / session bootstrap. */
export function WoneyLoader({ label = "Loading" }: { label?: string }) {
  const reduce = useReducedMotion();
  const markRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);

  const x = useMotionValue(REST_X);
  const y = useMotionValue(REST_Y);
  const springX = useSpring(x, { stiffness: 140, damping: 28, mass: 0.7 });
  const springY = useSpring(y, { stiffness: 140, damping: 28, mass: 0.7 });
  const glowLeft = useMotionTemplate`${springX}%`;
  const glowTop = useMotionTemplate`${springY}%`;

  // Soft idle drift when the pointer is away — same language as AuthBrand, quieter amplitude.
  useEffect(() => {
    if (reduce) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      if (!hovering.current) {
        const t = (now - start) / 1000;
        x.set(REST_X + Math.sin(t * 0.45) * 3.5);
        y.set(REST_Y + Math.cos(t * 0.38) * 2.5);
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
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: ENTER_EASE }}
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
            animate={
              reduce
                ? undefined
                : {
                    scale: [1, 1.04, 1],
                    opacity: [0.72, 1, 0.72],
                  }
            }
            transition={
              reduce
                ? undefined
                : { duration: 5.5, repeat: Infinity, ease: "easeInOut" }
            }
          />

          <span className="woney-loader-word">Woney</span>
          <span className="woney-loader-rule" />
        </div>

        <div className="woney-loader-track" aria-hidden>
          {!reduce ? (
            <motion.span
              className="woney-loader-progress"
              initial={{ scaleX: 0.22, x: "-35%" }}
              animate={{ scaleX: [0.22, 0.5, 0.28], x: ["-35%", "8%", "50%"] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: ENTER_EASE,
              }}
            />
          ) : (
            <span className="woney-loader-progress woney-loader-progress-static" />
          )}
        </div>
        <p className="woney-loader-label">{label}</p>
      </motion.div>
    </div>
  );
}
