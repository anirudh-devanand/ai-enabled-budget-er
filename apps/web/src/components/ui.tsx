"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CategoryIcon } from "@/components/CategoryChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { passwordScore } from "@/lib/ui";

export { CategoryIcon };

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/transactions", label: "Activity" },
  { href: "/insights", label: "Insights" },
  { href: "/budgets", label: "Budgets" },
  { href: "/goals", label: "Goals" },
  { href: "/assistant", label: "Assistant" },
  { href: "/account", label: "Account" },
];

export function AppShell({
  children,
  householdId,
}: {
  children: React.ReactNode;
  householdId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api.logout();
    router.replace("/login");
  }

  return (
    <div className="app-frame">
      <aside className="app-nav">
        <Link href="/dashboard" className="brand">
          Woney
        </Link>
        <nav>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${pathname === l.href || pathname?.startsWith(l.href + "/") ? " active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-footer">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-block" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, checks } = passwordScore(password);
  if (!password) return null;
  return (
    <div className="pw-meter">
      <div className="pw-meter-bars" data-score={score}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= score ? "on" : ""} />
        ))}
      </div>
      <div className="pw-meter-label">
        Strength: <strong>{label}</strong>
      </div>
      <ul className="pw-checks">
        {checks.map((c) => (
          <li key={c.id} className={c.ok ? "ok" : ""}>
            {c.ok ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FilterBar({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="filter-bar">{children}</div>;
}
