"use client";

import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";

const DIGIT_RE = /^\d$/;

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Triggers a brief shake when truthy / when the value changes. */
  errorKey?: string | null;
  /** Called once when `value` reaches `length` digits (caller handles submit). */
  onComplete?: (value: string) => void;
  "aria-label"?: string;
  id?: string;
};

function onlyDigits(raw: string, max: number): string {
  return raw.replace(/\D/g, "").slice(0, max);
}

/** Segmented 6-digit OTP boxes with paste + auto-advance. */
export function OtpInput({
  length = 6,
  value,
  onChange,
  disabled,
  autoFocus,
  errorKey,
  onComplete,
  "aria-label": ariaLabel = "One-time code",
  id,
}: Props) {
  const baseId = useId();
  const inputId = id ?? baseId;
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const completedRef = useRef<string | null>(null);
  const code = onlyDigits(value, length);
  const reduce = useReducedMotion();
  const shakeControls = useAnimationControls();
  const lastError = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (errorKey && errorKey !== lastError.current && !reduce) {
      void shakeControls.start({
        x: [0, -5, 5, -3, 3, 0],
        transition: { duration: 0.35 },
      });
    }
    lastError.current = errorKey;
  }, [errorKey, reduce, shakeControls]);

  useEffect(() => {
    if (code.length === length) {
      if (completedRef.current !== code) {
        completedRef.current = code;
        onComplete?.(code);
      }
    } else {
      completedRef.current = null;
    }
  }, [code, length, onComplete]);

  function focusAt(index: number) {
    const el = refs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function setCode(next: string, focusIndex?: number) {
    const cleaned = onlyDigits(next, length);
    onChange(cleaned);
    if (typeof focusIndex === "number") {
      requestAnimationFrame(() => focusAt(Math.min(Math.max(focusIndex, 0), length - 1)));
    }
  }

  function onDigitChange(index: number, raw: string) {
    if (disabled) return;
    // Autofill / multi-char paste into one box
    if (raw.length > 1) {
      const pasted = onlyDigits(raw, length);
      setCode(pasted, Math.min(pasted.length, length - 1));
      return;
    }
    if (raw === "") {
      setCode(code.slice(0, index) + code.slice(index + 1), index);
      return;
    }
    if (!DIGIT_RE.test(raw)) return;
    if (index >= code.length) {
      setCode(onlyDigits(code + raw, length), Math.min(code.length + 1, length - 1));
      return;
    }
    const next = code.slice(0, index) + raw + code.slice(index + 1);
    setCode(onlyDigits(next, length), Math.min(index + 1, length - 1));
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (e.key === "Backspace") {
      if (code[index]) {
        e.preventDefault();
        setCode(code.slice(0, index) + code.slice(index + 1), index);
      } else if (index > 0) {
        e.preventDefault();
        setCode(code.slice(0, index - 1) + code.slice(index), index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusAt(index + 1);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (disabled) return;
    e.preventDefault();
    const pasted = onlyDigits(e.clipboardData.getData("text"), length);
    if (!pasted) return;
    setCode(pasted, Math.min(pasted.length, length - 1));
  }

  return (
    <motion.div
      className="otp-input"
      role="group"
      aria-label={ariaLabel}
      animate={shakeControls}
    >
      {Array.from({ length }, (_, index) => {
        const digit = code[index] ?? "";
        const filled = digit !== "";
        return (
          <motion.input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={index === 0 ? inputId : undefined}
            className="otp-digit"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            name={index === 0 ? "one-time-code" : undefined}
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`Digit ${index + 1} of ${length}`}
            onChange={(e) => onDigitChange(index, e.target.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            onPaste={onPaste}
            onFocus={(e) => {
              const nextEmpty = Math.min(code.length, length - 1);
              if (index > nextEmpty) {
                focusAt(nextEmpty);
                return;
              }
              e.target.select();
            }}
            animate={
              reduce
                ? undefined
                : { scale: filled ? 1.02 : 1 }
            }
            whileFocus={reduce ? undefined : { scale: 1.05 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          />
        );
      })}
    </motion.div>
  );
}
