import type { CategoryKey } from "@/lib/ui";
import { categoryMeta } from "@/lib/ui";

const stroke = "currentColor";

function SvgShell({ children, size = 22 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ICONS: Record<CategoryKey, React.ReactNode> = {
  income: (
    <SvgShell>
      <path d="M12 19V5" />
      <path d="M7 10l5-5 5 5" />
    </SvgShell>
  ),
  transfers: (
    <SvgShell>
      <path d="M7 7h11l-3-3" />
      <path d="M17 17H6l3 3" />
    </SvgShell>
  ),
  groceries: (
    <SvgShell>
      <path d="M6 7h12l-1 12H7L6 7z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </SvgShell>
  ),
  dining: (
    <SvgShell>
      <path d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
      <path d="M10 13v8" />
      <path d="M16 3v18" />
      <path d="M16 3c2 0 3 1.5 3 4s-1 4-3 4" />
    </SvgShell>
  ),
  transport: (
    <SvgShell>
      <rect x="4" y="9" width="16" height="8" rx="2" />
      <path d="M7 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
      <circle cx="8" cy="17" r="1.25" fill={stroke} stroke="none" />
      <circle cx="16" cy="17" r="1.25" fill={stroke} stroke="none" />
    </SvgShell>
  ),
  housing: (
    <SvgShell>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </SvgShell>
  ),
  utilities: (
    <SvgShell>
      <path d="M13 2L6 13h5l-1 9 8-12h-5l0-8z" />
    </SvgShell>
  ),
  subscriptions: (
    <SvgShell>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8" />
      <path d="M4 20v-5h5" />
    </SvgShell>
  ),
  shopping: (
    <SvgShell>
      <path d="M6 8h12l-1 11H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M9 12h6" />
    </SvgShell>
  ),
  health: (
    <SvgShell>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </SvgShell>
  ),
  entertainment: (
    <SvgShell>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M10 10l5 2-5 2v-4z" fill={stroke} stroke="none" />
    </SvgShell>
  ),
  travel: (
    <SvgShell>
      <path d="M10 14l-6 3 1-4 9-7 2 2-6 6z" />
      <path d="M14 7l4-3 2 2-3 4" />
    </SvgShell>
  ),
  fees: (
    <SvgShell>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 4.3L2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    </SvgShell>
  ),
  other: (
    <SvgShell>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 12h.01" />
    </SvgShell>
  ),
};

export function CategoryGlyph({
  name,
  size = 22,
}: {
  name?: string | null;
  size?: number;
}) {
  const { key } = categoryMeta(name);
  return (
    <span className="cat-glyph" style={{ color: "var(--ink)", width: size, height: size }}>
      {ICONS[key]}
    </span>
  );
}
