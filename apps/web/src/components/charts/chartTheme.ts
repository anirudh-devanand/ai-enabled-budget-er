"use client";

/** Gold–olive spending slices — professional, not rainbow. */
export const CATEGORY_PIE_PALETTE = [
  "#b89a4a",
  "#7d9a7c",
  "#c4a484",
  "#8a9a6e",
  "#a68b3c",
  "#6b8570",
  "#d4b87a",
  "#9aab8c",
  "#8b7355",
  "#5c6b5a",
  "#c9ae66",
  "#7a8f72",
] as const;

export function chartColors() {
  if (typeof window === "undefined") {
    return {
      text: "#ecece8",
      muted: "#9b9b95",
      border: "#333333",
      income: "#7d9a7c",
      spending: "#c4a484",
      accent: "#ecece8",
      gold: "#b89a4a",
      grid: "rgba(255,255,255,0.06)",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const text = s.getPropertyValue("--text").trim() || "#ecece8";
  const muted = s.getPropertyValue("--muted").trim() || "#9b9b95";
  const border = s.getPropertyValue("--border").trim() || "#333";
  const gold = s.getPropertyValue("--gold").trim() || "#b89a4a";
  return {
    text,
    muted,
    border,
    income: "#7d9a7c",
    spending: "#c4a484",
    accent: text,
    gold,
    grid: text.startsWith("#e") || text.startsWith("#f")
      ? "rgba(0,0,0,0.06)"
      : "rgba(255,255,255,0.06)",
  };
}
