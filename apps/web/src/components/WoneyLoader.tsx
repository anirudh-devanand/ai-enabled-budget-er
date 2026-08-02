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
const REST_Y = 48;

const PARTICLES = [
  { r: 42, phase: 0, speed: 3.2, size: 3 },
  { r: 48, phase: 2.1, speed: 2.2, size: 2 },
  { r: 36, phase: 4.0, speed: 2.6, size: 2.5 },
  { r: 46, phase: 5.4, speed: 3.8, size: 2 },
] as const;

/** Full-page brand splash while auth / session bootstrap. */
export function WoneyLoader({ label = "Loading" }: { label?: string }) {
  const reduce = useReducedMotion();
  const markRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);

  const x = useMotionValue(REST_X);
  const y = useMotionValue(REST_Y);
  const springX = useSpring(x, { stiffness: 160, damping: 28, mass: 0.65 });
  const springY = useSpring(y, { stiffness: 160, damping: 28, mass: 0.65 });
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
        x.set(REST_X + Math.sin(t * 0.7) * 7);
        y.set(REST_Y + Math.cos(t * 0.55) * 5.5);
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
          />

          {!reduce ? (
            <>
              <motion.span
                className="woney-loader-ring woney-loader-ring-outer"
                animate={{ rotate: 360 }}
                transition={{ duration: 8.5, repeat: Infinity, ease: "linear" }}
              />
              <motion.span
                className="woney-loader-ring woney-loader-ring-inner"
                animate={{ rotate: -360 }}
                transition={{ duration: 5.2, repeat: Infinity, ease: "linear" }}
              />
              {PARTICLES.map((p, i) => (
                <motion.span
                  key={i}
                  className="woney-loader-particle"
                  style={{ width: p.size, height: p.size }}
                  animate={{
                    x: [
                      Math.cos(p.phase) * p.r,
                      Math.cos(p.phase + Math.PI) * p.r,
                      Math.cos(p.phase + Math.PI * 2) * p.r,
                    ],
                    y: [
                      Math.sin(p.phase) * p.r,
                      Math.sin(p.phase + Math.PI) * p.r,
                      Math.sin(p.phase + Math.PI * 2) * p.r,
                    ],
                    opacity: [0.25, 0.7, 0.25],
                  }}
                  transition={{
                    duration: p.speed,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </>
          ) : (
            <span className="woney-loader-ring woney-loader-ring-static" />
          )}

          <motion.span
            className="woney-loader-word"
            animate={
              reduce
                ? undefined
                : {
                    opacity: [0.78, 1, 0.78],
                    scale: [0.985, 1.02, 0.985],
                  }
            }
            transition={
              reduce
                ? undefined
                : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
            }
            whileHover={reduce ? undefined : { scale: 1.04 }}
          >
            Woney
          </motion.span>
        </div>

        <div className="woney-loader-track" aria-hidden>
          {!reduce ? (
            <motion.span
              className="woney-loader-progress"
              initial={{ scaleX: 0.18, x: "-40%" }}
              animate={{ scaleX: [0.18, 0.55, 0.28], x: ["-40%", "10%", "55%"] }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: EASE,
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
