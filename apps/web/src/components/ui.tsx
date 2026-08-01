"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { AnimatedToast } from "@/components/AnimatedToast";
import { BankReauthPrompt } from "@/components/BankReauthPrompt";
import { CategoryIcon } from "@/components/CategoryChip";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import {
  getBankSyncState,
  subscribeBankSync,
  syncMyBanks,
  type BankSyncState,
} from "@/lib/bankSync";
import { passwordScore } from "@/lib/ui";

export { CategoryIcon };

const PAGE_EASE = [0.22, 1, 0.36, 1] as const;

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
  householdId: _householdId,
  onRefresh,
}: {
  children: React.ReactNode;
  householdId?: string | null;
  /** Re-fetch page data after a bank sync completes. */
  onRefresh?: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [reauthRequired, setReauthRequired] = useState<BankSyncState["reauthRequired"]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((u) => {
        if (!cancelled) setMfaEnabled(u.mfa_enabled);
      })
      .catch(() => {
        if (!cancelled) setMfaEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    // Preserve in-flight login sync so we refresh when it finishes.
    let wasSyncing = getBankSyncState().syncing;
    setSyncing(wasSyncing);
    setReauthRequired(getBankSyncState().reauthRequired);
    return subscribeBankSync((state) => {
      setSyncing(state.syncing);
      setReauthRequired(state.reauthRequired);
      if (wasSyncing && !state.syncing && onRefresh) {
        void Promise.resolve(onRefresh()).catch(() => undefined);
      }
      wasSyncing = state.syncing;
    });
  }, [onRefresh]);

  async function logout() {
    await api.logout();
    router.replace("/login");
  }

  async function handleRefresh() {
    setToast(null);
    if (mfaEnabled === false) {
      setToast("Turn on email MFA in Account before syncing banks");
      setTimeout(() => setToast(null), 3200);
      return;
    }
    try {
      const result = await syncMyBanks({ force: true });
      if (result.reauthRequired.length > 0) {
        // Modal is driven by bankSync state — avoid a cryptic toast.
        setToast(null);
      } else if (result.failed > 0) {
        setToast(`Synced ${result.synced}, ${result.failed} failed`);
      } else if (result.synced === 0 && result.skipped === 0) {
        setToast("No banks to sync");
      } else if (!result.deduped) {
        setToast("Accounts refreshed");
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      if (/mfa_required/i.test(detail)) {
        setToast("Turn on email MFA in Account before syncing banks");
      } else {
        setToast("Could not sync banks");
      }
    } finally {
      setTimeout(() => setToast(null), 2800);
    }
  }

  return (
    <div className="app-frame">
      <aside className="app-nav">
        <Link href="/dashboard" className="brand">
          Woney
        </Link>
        <nav>
          {LINKS.map((l) => {
            const active =
              pathname === l.href || Boolean(pathname?.startsWith(l.href + "/"));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`nav-link${active ? " active" : ""}${active && !reduceMotion ? " has-motion-indicator" : ""}`}
              >
                {active && !reduceMotion ? (
                  <motion.span
                    layoutId="app-nav-active"
                    className="nav-active-indicator"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                ) : null}
                <span className="nav-link-label">{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="nav-footer">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost btn-block" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="app-main">
        <div className="app-chrome-bar">
          <button
            type="button"
            className={`btn btn-ghost btn-icon${syncing ? " is-spinning" : ""}`}
            onClick={handleRefresh}
            disabled={syncing}
            aria-label={syncing ? "Syncing banks" : "Refresh bank data"}
            title={syncing ? "Syncing…" : "Refresh banks"}
          >
            <RefreshIcon />
          </button>
        </div>
        {mfaEnabled === false && (
          <div className="security-banner" role="status">
            Turn on email MFA before linking banks.{" "}
            <Link href="/account#security">Account → Security</Link>
          </div>
        )}
        <AnimatedToast message={toast} className="app-chrome-toast" />
        <motion.div
          key={pathname}
          className="app-page"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: PAGE_EASE }}
        >
          {children}
        </motion.div>
      </div>
      <BankReauthPrompt targets={reauthRequired} />
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12a9 9 0 1 1-2.64-6.36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M21 3v6h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
