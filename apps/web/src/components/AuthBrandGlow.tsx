"use client";

import { useEffect, useRef } from "react";

/** Soft gold glow that gently follows the pointer inside the auth brand panel. */
export function AuthBrandGlow({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onMove(e: MouseEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--glow-x", `${x}%`);
      el.style.setProperty("--glow-y", `${y}%`);
    }

    function onLeave() {
      if (!el) return;
      el.style.setProperty("--glow-x", "72%");
      el.style.setProperty("--glow-y", "88%");
    }

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <section ref={ref} className="auth-brand auth-brand-interactive">
      {children}
    </section>
  );
}
