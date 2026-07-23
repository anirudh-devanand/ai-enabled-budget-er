"use client";

import { useState } from "react";

type BankMeta = {
  label: string;
  domain: string | null;
  localSrc: string | null;
  bg: string;
};

function matchBank(name: string | null | undefined): BankMeta {
  const n = (name || "").toLowerCase();
  if (n.includes("toronto-dominion") || n.includes("td bank") || /\btd\b/.test(n)) {
    return { label: "TD", domain: "td.com", localSrc: "/banks/td.png", bg: "#34A853" };
  }
  if (n.includes("royal bank") || n.includes("rbc")) {
    return { label: "RBC", domain: "rbcroyalbank.com", localSrc: "/banks/rbc.png", bg: "#0051A5" };
  }
  if (n.includes("scotia")) {
    return { label: "Scotia", domain: "scotiabank.com", localSrc: "/banks/scotia.png", bg: "#EC111A" };
  }
  if (n.includes("bank of montreal") || /\bbmo\b/.test(n)) {
    return { label: "BMO", domain: "bmo.com", localSrc: "/banks/bmo.png", bg: "#0079C1" };
  }
  if (n.includes("cibc") || n.includes("canadian imperial")) {
    return { label: "CIBC", domain: "cibc.com", localSrc: "/banks/cibc.png", bg: "#C41F3E" };
  }
  if (n.includes("eq bank") || n.includes("equitable")) {
    return { label: "EQ", domain: "eqbank.ca", localSrc: "/banks/eq.png", bg: "#111111" };
  }
  if (n.includes("wealthsimple")) {
    return {
      label: "WS",
      domain: "wealthsimple.com",
      localSrc: "/banks/wealthsimple.png",
      bg: "#1C1C1C",
    };
  }
  if (n.includes("neo")) {
    return { label: "Neo", domain: "neofinancial.com", localSrc: "/banks/neo.png", bg: "#0B0B0B" };
  }
  if (n.includes("plaid") || n.includes("first platypus") || n.includes("chase")) {
    return { label: "Plaid", domain: "plaid.com", localSrc: "/banks/plaid.png", bg: "#0A85EA" };
  }
  if (n.includes("csv") || n.includes("import")) {
    return { label: "CSV", domain: null, localSrc: null, bg: "#2a2a2a" };
  }
  const initials = (name || "Bank")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return { label: initials || "BK", domain: null, localSrc: null, bg: "#2a2a2a" };
}

function remoteLogo(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function BankLogo({
  institutionName,
  size = 44,
}: {
  institutionName?: string | null;
  size?: number;
}) {
  const meta = matchBank(institutionName);
  const candidates = [
    meta.domain ? remoteLogo(meta.domain) : null,
    meta.localSrc,
  ].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? null;
  const failed = !src || idx >= candidates.length;

  return (
    <div
      className="bank-logo"
      style={{
        width: size,
        height: size,
        background: failed ? meta.bg : "#fff",
        color: "#fff",
      }}
      title={institutionName || meta.label}
      aria-hidden
    >
      {!failed && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={Math.round(size * 0.62)}
          height={Math.round(size * 0.62)}
          style={{ objectFit: "contain" }}
          onError={() => setIdx((i) => i + 1)}
        />
      ) : (
        <span style={{ fontSize: size * 0.32, fontWeight: 800 }}>{meta.label}</span>
      )}
    </div>
  );
}
