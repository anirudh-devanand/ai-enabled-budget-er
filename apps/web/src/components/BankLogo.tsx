"use client";

import { useState } from "react";

type BankMeta = {
  label: string;
  localSrc: string | null;
  bg: string;
};

function matchBank(name: string | null | undefined): BankMeta {
  const n = (name || "").toLowerCase();
  if (n.includes("toronto-dominion") || n.includes("td bank") || /\btd\b/.test(n)) {
    return { label: "TD", localSrc: "/banks/td.png", bg: "#34A853" };
  }
  if (n.includes("royal bank") || n.includes("rbc")) {
    return { label: "RBC", localSrc: "/banks/rbc.png", bg: "#0051A5" };
  }
  if (n.includes("scotia")) {
    return { label: "Scotia", localSrc: "/banks/scotia.png", bg: "#EC111A" };
  }
  if (n.includes("bank of montreal") || /\bbmo\b/.test(n)) {
    return { label: "BMO", localSrc: "/banks/bmo.png", bg: "#0079C1" };
  }
  if (n.includes("cibc") || n.includes("canadian imperial")) {
    return { label: "CIBC", localSrc: "/banks/cibc.png", bg: "#C41F3E" };
  }
  if (n.includes("eq bank") || n.includes("equitable")) {
    return { label: "EQ", localSrc: "/banks/eq.png", bg: "#111111" };
  }
  if (n.includes("wealthsimple")) {
    return { label: "WS", localSrc: "/banks/wealthsimple.png", bg: "#1C1C1C" };
  }
  if (n.includes("neo")) {
    return { label: "Neo", localSrc: "/banks/neo.png", bg: "#0B0B0B" };
  }
  if (n.includes("plaid") || n.includes("first platypus") || n.includes("chase")) {
    return { label: "Plaid", localSrc: "/banks/plaid.png", bg: "#0A85EA" };
  }
  if (n.includes("csv") || n.includes("import")) {
    return { label: "CSV", localSrc: null, bg: "#2a2a2a" };
  }
  const initials = (name || "Bank")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return { label: initials || "BK", localSrc: null, bg: "#2a2a2a" };
}

export function BankLogo({
  institutionName,
  size = 44,
}: {
  institutionName?: string | null;
  size?: number;
}) {
  const meta = matchBank(institutionName);
  const [failed, setFailed] = useState(!meta.localSrc);

  return (
    <div
      className="bank-logo"
      style={{
        width: size,
        height: size,
        // Never paint a white/canvas plate behind the mark — only fallback tint when image fails.
        background: failed ? meta.bg : "transparent",
        color: "#fff",
      }}
      title={institutionName || meta.label}
      aria-hidden
    >
      {!failed && meta.localSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.localSrc}
          alt=""
          width={size}
          height={size}
          style={{ objectFit: "contain", width: "100%", height: "100%", background: "transparent" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.32, fontWeight: 800 }}>{meta.label}</span>
      )}
    </div>
  );
}
