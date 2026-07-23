"use client";

import { useRef } from "react";

type Props = {
  headline: string;
  lede: string;
  footer?: string;
};

/** Dark brand panel with a soft gold glow that follows the pointer. */
export function AuthBrand({ headline, lede, footer = "Built for Canada." }: Props) {
  const ref = useRef<HTMLElement>(null);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--glow-x", `${x}%`);
    el.style.setProperty("--glow-y", `${y}%`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--glow-x", "70%");
    el.style.setProperty("--glow-y", "85%");
  }

  return (
    <section
      ref={ref}
      className="auth-brand"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ ["--glow-x" as string]: "70%", ["--glow-y" as string]: "85%" }}
    >
      <div className="auth-glow" aria-hidden />
      <div className="logo">Woney</div>
      <div>
        <h2 className="headline">{headline}</h2>
        <p className="lede">{lede}</p>
      </div>
      <p className="lede" style={{ marginBottom: 0 }}>
        {footer}
      </p>
    </section>
  );
}
