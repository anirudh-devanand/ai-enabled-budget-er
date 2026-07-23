"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " theme-toggle-compact" : ""}`}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <span className="theme-toggle-track" data-mode={theme}>
        <span className="theme-toggle-thumb" />
      </span>
      {!compact && (
        <span className="theme-toggle-label">{isDark ? "Dark" : "Light"}</span>
      )}
    </button>
  );
}
