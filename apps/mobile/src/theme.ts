export function money(amount: string | number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

/** Mobile-first premium palette — metallic gold on warm charcoal/cream. */
export const colors = {
  bg: "#f6f4ef",
  card: "#ffffff",
  border: "#e2ddd2",
  borderStrong: "#c9c1b0",
  text: "#1a1814",
  muted: "#6b655a",
  accent: "#b8953d",
  accentSoft: "#f3ead5",
  accentHover: "#9a7a2e",
  goldDeep: "#8a6b28",
  goldBright: "#c9a84a",
  goldShine: "#e8d5a3",
  danger: "#c23b3b",
  dangerSoft: "#fdeeee",
  positive: "#2f6b4f",
  tabBar: "#ffffff",
  authBg: "#141210",
  authCard: "#1c1915",
  authBorder: "#3a3428",
  authMuted: "#a39a88",
  authText: "#f5f1e8",
};

export type CategoryKey =
  | "income"
  | "transfers"
  | "groceries"
  | "dining"
  | "transport"
  | "housing"
  | "utilities"
  | "subscriptions"
  | "shopping"
  | "health"
  | "entertainment"
  | "travel"
  | "fees"
  | "other";

export const CATEGORY_META: Record<
  string,
  { key: CategoryKey; bg: string; match: RegExp }
> = {
  income: { key: "income", bg: "#f3ead5", match: /income/i },
  transfers: { key: "transfers", bg: "#eeeae3", match: /transfer/i },
  groceries: { key: "groceries", bg: "#efe9dc", match: /grocer/i },
  dining: { key: "dining", bg: "#f2ebe0", match: /dining|takeout|food/i },
  transport: { key: "transport", bg: "#ebe8e1", match: /transport|transit|gas/i },
  housing: { key: "housing", bg: "#f0e8dc", match: /housing|rent|mortgage/i },
  utilities: { key: "utilities", bg: "#efe9d8", match: /utilit|bill/i },
  subscriptions: { key: "subscriptions", bg: "#ebe6df", match: /subscription/i },
  shopping: { key: "shopping", bg: "#f1e8e4", match: /shop/i },
  health: { key: "health", bg: "#e8efe9", match: /health|fitness|pharm/i },
  entertainment: { key: "entertainment", bg: "#f0e6ea", match: /entertain/i },
  travel: { key: "travel", bg: "#e6ecf2", match: /travel|flight|hotel/i },
  fees: { key: "fees", bg: "#f3e4e4", match: /fee|charge/i },
  other: { key: "other", bg: "#eeeae3", match: /other|uncategor/i },
};

export function categoryMeta(nameOrSlug?: string | null) {
  if (!nameOrSlug) return CATEGORY_META.other;
  const key = Object.keys(CATEGORY_META).find((k) => CATEGORY_META[k].match.test(nameOrSlug));
  return key ? CATEGORY_META[key] : CATEGORY_META.other;
}

export function passwordScore(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  checks: { id: string; label: string; ok: boolean }[];
} {
  const checks = [
    { id: "len", label: "At least 10 characters", ok: password.length >= 10 },
    { id: "upper", label: "One uppercase letter", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "One lowercase letter", ok: /[a-z]/.test(password) },
    {
      id: "numsym",
      label: "A number or symbol",
      ok: /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password),
    },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const score = Math.min(4, passed) as 0 | 1 | 2 | 3 | 4;
  const label =
    score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
  return { score, label, checks };
}
