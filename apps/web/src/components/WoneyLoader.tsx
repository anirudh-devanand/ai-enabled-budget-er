"use client";

import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Full-page brand splash while auth / session bootstrap. */
export function WoneyLoader({ label = "Loading" }: { label?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className="woney-loader" role="status" aria-live="polite" aria-label={label}>
      <motion.div
        className="woney-loader-inner"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
      >
        <div className="woney-loader-mark" aria-hidden>
          <motion.span
            className="woney-loader-word"
            animate={
              reduce
                ? undefined
                : {
                    opacity: [0.72, 1, 0.72],
                  }
            }
            transition={
              reduce
                ? undefined
                : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            }
          >
            Woney
          </motion.span>
          {!reduce ? (
            <motion.span
              className="woney-loader-ring"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.35, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <span className="woney-loader-ring woney-loader-ring-static" />
          )}
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
