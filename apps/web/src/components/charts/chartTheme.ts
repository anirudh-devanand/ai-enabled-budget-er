"use client";

export function chartColors() {
  if (typeof window === "undefined") {
    return {
      text: "#ecece8",
      muted: "#9b9b95",
      border: "#333333",
      income: "#7d9a7c",
      spending: "#c4a484",
      accent: "#ecece8",
      grid: "rgba(255,255,255,0.06)",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const text = s.getPropertyValue("--text").trim() || "#ecece8";
  const muted = s.getPropertyValue("--muted").trim() || "#9b9b95";
  const border = s.getPropertyValue("--border").trim() || "#333";
  return {
    text,
    muted,
    border,
    income: "#7d9a7c",
    spending: "#c4a484",
    accent: text,
    grid: text.startsWith("#e") || text.startsWith("#f")
      ? "rgba(0,0,0,0.06)"
      : "rgba(255,255,255,0.06)",
  };
}
