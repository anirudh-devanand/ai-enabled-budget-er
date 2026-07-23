"use client";

/** Compact brand marks for Canadian banks + aggregators used in Woney. */

type BankMeta = {
  label: string;
  bg: string;
  fg: string;
  mark: "td" | "rbc" | "scotia" | "bmo" | "cibc" | "eq" | "ws" | "neo" | "plaid" | "csv" | "generic";
};

function matchBank(name: string | null | undefined): BankMeta {
  const n = (name || "").toLowerCase();
  if (n.includes("toronto-dominion") || n.includes("td bank") || /\btd\b/.test(n)) {
    return { label: "TD", bg: "#34A853", fg: "#fff", mark: "td" };
  }
  if (n.includes("royal bank") || n.includes("rbc")) {
    return { label: "RBC", bg: "#0051A5", fg: "#fff", mark: "rbc" };
  }
  if (n.includes("scotia")) {
    return { label: "Scotia", bg: "#EC111A", fg: "#fff", mark: "scotia" };
  }
  if (n.includes("bank of montreal") || /\bbmo\b/.test(n)) {
    return { label: "BMO", bg: "#0079C1", fg: "#fff", mark: "bmo" };
  }
  if (n.includes("cibc") || n.includes("canadian imperial")) {
    return { label: "CIBC", bg: "#C41F3E", fg: "#fff", mark: "cibc" };
  }
  if (n.includes("eq bank") || n.includes("equitable")) {
    return { label: "EQ", bg: "#111111", fg: "#F5C518", mark: "eq" };
  }
  if (n.includes("wealthsimple")) {
    return { label: "WS", bg: "#1C1C1C", fg: "#F7F4EF", mark: "ws" };
  }
  if (n.includes("neo")) {
    return { label: "Neo", bg: "#0B0B0B", fg: "#E8FF47", mark: "neo" };
  }
  if (n.includes("plaid") || n.includes("first platypus") || n.includes("chase")) {
    return { label: "Plaid", bg: "#0A85EA", fg: "#fff", mark: "plaid" };
  }
  if (n.includes("csv") || n.includes("import")) {
    return { label: "CSV", bg: "#B8953D", fg: "#fff", mark: "csv" };
  }
  const initials = (name || "Bank")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return { label: initials || "BK", bg: "#B8953D", fg: "#1A1814", mark: "generic" };
}

function Mark({ mark, fg }: { mark: BankMeta["mark"]; fg: string }) {
  const stroke = fg;
  switch (mark) {
    case "td":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path fill={stroke} d="M4 6h16v3H14v9h-4V9H4V6z" />
        </svg>
      );
    case "rbc":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke={stroke} strokeWidth="2.2" />
          <circle cx="12" cy="12" r="3.2" fill={stroke} />
        </svg>
      );
    case "scotia":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path
            fill={stroke}
            d="M12 3l7 4v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V7l7-4zm0 3.2L8 8.4v3.4c0 2.8 1.8 5 4 5.9 2.2-.9 4-3.1 4-5.9V8.4L12 6.2z"
          />
        </svg>
      );
    case "bmo":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke={stroke} strokeWidth="2" />
          <path fill={stroke} d="M8 9h8v2H8zm0 4h5v2H8z" />
        </svg>
      );
    case "cibc":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path fill={stroke} d="M5 7h14v2.5H5V7zm0 4h14v2.5H5V11zm0 4h9v2.5H5V15z" />
        </svg>
      );
    case "eq":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path fill={stroke} d="M6 6h12v3H9v2h8v3H9v2h9v3H6V6z" />
        </svg>
      );
    case "ws":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path
            fill={stroke}
            d="M4 17L8.2 6h3.1L14 13.2 16.7 6H20L15.5 18h-3.2L9.5 9.6 7.2 18H4z"
          />
        </svg>
      );
    case "neo":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke={stroke} strokeWidth="2" />
          <path fill={stroke} d="M9 8h2.2l4.8 8H13.8L9 8zm4.2 0H16v8h-2.8V8z" />
        </svg>
      );
    case "plaid":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path
            fill={stroke}
            d="M7 4h10a3 3 0 013 3v10a3 3 0 01-3 3H7a3 3 0 01-3-3V7a3 3 0 013-3zm1 4v8h2.2V8H8zm5.2 0v8H16V8h-2.8z"
          />
        </svg>
      );
    case "csv":
      return (
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path
            fill={stroke}
            d="M6 3h8l4 4v14H6V3zm8 1.5V8h3.5L14 4.5zM8 11h8v1.6H8V11zm0 3.2h8v1.6H8v-1.6zm0 3.2h5v1.6H8v-1.6z"
          />
        </svg>
      );
    default:
      return (
        <span style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: "0.04em" }}>
          {mark === "generic" ? "" : mark}
        </span>
      );
  }
}

export function BankLogo({
  institutionName,
  size = 44,
}: {
  institutionName?: string | null;
  size?: number;
}) {
  const meta = matchBank(institutionName);
  return (
    <div
      className="bank-logo"
      style={{
        width: size,
        height: size,
        background: meta.bg,
        color: meta.fg,
      }}
      title={institutionName || meta.label}
      aria-hidden
    >
      {meta.mark === "generic" ? (
        <span style={{ fontSize: size * 0.32, fontWeight: 800 }}>{meta.label}</span>
      ) : (
        <Mark mark={meta.mark} fg={meta.fg} />
      )}
    </div>
  );
}
