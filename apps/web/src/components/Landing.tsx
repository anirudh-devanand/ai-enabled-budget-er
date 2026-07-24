"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const HERO_TXNS = [
  { name: "Loblaws", cat: "Groceries", amount: "−$64.20", tone: "out" },
  { name: "Payroll", cat: "Income", amount: "+$2,410.00", tone: "in" },
  { name: "Presto", cat: "Transit", amount: "−$12.50", tone: "out" },
  { name: "Rent", cat: "Home", amount: "−$1,850.00", tone: "out" },
] as const;

/** Living product UI — balance, budget ring, cycling transaction feed. */
function HeroScene() {
  return (
    <div className="landing-scene landing-scene--hero" aria-hidden>
      <div className="landing-hero-ambient">
        <span className="landing-hero-orb landing-hero-orb--a" />
        <span className="landing-hero-orb landing-hero-orb--b" />
        <span className="landing-hero-orb landing-hero-orb--c" />
      </div>

      <div className="landing-hero-stage">
        <div className="landing-hero-balance-card landing-hero-float">
          <p className="landing-hero-soft-label">Available</p>
          <p className="landing-hero-balance-amount">
            <span className="landing-hero-balance-currency">$</span>
            <span className="landing-hero-balance-digits">12,480</span>
            <span className="landing-hero-balance-cents">.60</span>
          </p>
          <p className="landing-hero-balance-meta">Across 3 accounts · synced</p>
        </div>

        <div className="landing-hero-ring-wrap landing-hero-float landing-hero-float--delay">
          <svg className="landing-hero-ring" viewBox="0 0 120 120">
            <circle className="landing-hero-ring-track" cx="60" cy="60" r="48" />
            <circle className="landing-hero-ring-progress" cx="60" cy="60" r="48" />
          </svg>
          <div className="landing-hero-ring-center">
            <span className="landing-hero-ring-pct">62%</span>
            <span className="landing-hero-ring-caption">budget left</span>
          </div>
        </div>

        <div className="landing-hero-feed landing-hero-float landing-hero-float--delay-2">
          <p className="landing-hero-soft-label">Recent</p>
          <ul className="landing-hero-feed-list">
            {HERO_TXNS.map((txn, i) => (
              <li
                key={txn.name}
                className="landing-hero-feed-item"
                style={{ ["--feed-i" as string]: String(i) }}
              >
                <span className="landing-hero-feed-name">{txn.name}</span>
                <span className="landing-hero-feed-cat">{txn.cat}</span>
                <span className={`landing-hero-feed-amt landing-hero-feed-amt--${txn.tone}`}>
                  {txn.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Borderless Bank Sync visual — open list on the section background. */
function BankSyncScene() {
  return (
    <div className="landing-banks-plane" aria-hidden>
      <p className="landing-scene-label">Linked accounts</p>
      <ul className="landing-banks-list">
        <li>
          <span className="landing-banks-mark" style={{ background: "#34A853" }}>
            TD
          </span>
          <span className="landing-banks-meta">
            <strong>TD Chequing</strong>
            <em>••4821</em>
          </span>
          <span className="landing-banks-bal">$4,210.32</span>
        </li>
        <li>
          <span className="landing-banks-mark" style={{ background: "#0051A5" }}>
            RBC
          </span>
          <span className="landing-banks-meta">
            <strong>RBC Savings</strong>
            <em>••0194</em>
          </span>
          <span className="landing-banks-bal">$6,850.00</span>
        </li>
        <li>
          <span className="landing-banks-mark" style={{ background: "#1C1C1C" }}>
            WS
          </span>
          <span className="landing-banks-meta">
            <strong>Wealthsimple Cash</strong>
            <em>••7730</em>
          </span>
          <span className="landing-banks-bal">$1,420.28</span>
        </li>
      </ul>
      <div className="landing-banks-sync">
        <span className="landing-banks-sync-dot" />
        Synced just now
      </div>
    </div>
  );
}

export function Landing() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      root.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.18 },
    );

    nodes.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <main ref={rootRef} className="landing">
      <header className="landing-nav">
        <Link href="/" className="landing-nav-brand" aria-label="Woney home">
          Woney
        </Link>
        <Link href="/login" className="landing-nav-link">
          Sign in
        </Link>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-atmosphere" aria-hidden />
        <div className="landing-hero-copy">
          <p className="landing-brand landing-enter" style={{ ["--enter-delay" as string]: "0ms" }}>
            Woney
          </p>
          <h1 className="landing-headline landing-enter" style={{ ["--enter-delay" as string]: "90ms" }}>
            Money that feels calm.
          </h1>
          <p className="landing-lede landing-enter" style={{ ["--enter-delay" as string]: "170ms" }}>
            Canadian bank sync, clear categories, and a planner that never invents the math.
          </p>
          <div className="landing-cta landing-enter" style={{ ["--enter-delay" as string]: "250ms" }}>
            <Link href="/register" className="btn btn-primary landing-btn">
              Create account
            </Link>
            <Link href="/login" className="btn btn-ghost landing-btn landing-btn-secondary">
              Sign in
            </Link>
          </div>
        </div>
        <HeroScene />
      </section>

      <section className="landing-block" data-reveal>
        <div className="landing-section-glow" aria-hidden />
        <div className="landing-block-inner">
          <p className="landing-kicker">Bank sync</p>
          <h2 className="landing-block-title">Your Canadian accounts, in one quiet place.</h2>
          <p className="landing-block-copy">
            Connect the banks you already use. Balances and transactions stay current so you can see
            the full picture without spreadsheet chaos.
          </p>
        </div>
        <div className="landing-block-visual landing-block-visual-soft" data-reveal>
          <BankSyncScene />
        </div>
      </section>

      <section className="landing-block landing-block-flip" data-reveal>
        <div className="landing-section-glow landing-section-glow--cool" aria-hidden />
        <div className="landing-block-inner">
          <p className="landing-kicker">Categories</p>
          <h2 className="landing-block-title">Clear labels. Less noise.</h2>
          <p className="landing-block-copy">
            Spending sorts into categories you recognize — groceries, transit, rent — so patterns
            show up without hunting through every line.
          </p>
        </div>
        <div className="landing-block-visual landing-block-visual-soft" data-reveal>
          <div className="landing-category-plane" aria-hidden>
            <div className="landing-category-row">
              <span className="landing-category-dot" style={{ background: "#6b8f71" }} />
              <span>Groceries</span>
              <span className="landing-category-bar" style={{ width: "68%" }} />
            </div>
            <div className="landing-category-row">
              <span className="landing-category-dot" style={{ background: "#8a7a55" }} />
              <span>Home</span>
              <span className="landing-category-bar" style={{ width: "44%" }} />
            </div>
            <div className="landing-category-row">
              <span className="landing-category-dot" style={{ background: "#5c7a8a" }} />
              <span>Transit</span>
              <span className="landing-category-bar" style={{ width: "32%" }} />
            </div>
            <div className="landing-category-row">
              <span className="landing-category-dot" style={{ background: "#9a6b5c" }} />
              <span>Dining</span>
              <span className="landing-category-bar" style={{ width: "51%" }} />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-block" data-reveal>
        <div className="landing-section-glow" aria-hidden />
        <div className="landing-block-inner">
          <p className="landing-kicker">Planner</p>
          <h2 className="landing-block-title">A planner that never invents the math.</h2>
          <p className="landing-block-copy">
            Budgets and goals stay honest. Woney works from your real numbers — no invented balances,
            no guesswork dressed up as advice.
          </p>
        </div>
        <div className="landing-block-visual" data-reveal>
          <div className="landing-plan-plane" aria-hidden>
            <p className="landing-plan-label">This month</p>
            <p className="landing-plan-title">Groceries budget</p>
            <div className="landing-plan-track">
              <span style={{ width: "62%" }} />
            </div>
            <p className="landing-plan-meta">$310 of $500 remaining</p>
          </div>
        </div>
      </section>

      <section className="landing-close" data-reveal>
        <div className="landing-section-glow landing-section-glow--close" aria-hidden />
        <p className="landing-brand landing-brand-close">Woney</p>
        <h2 className="landing-close-title">Built for trust. Tuned for everyday use.</h2>
        <p className="landing-close-copy">Start with a calm view of your money.</p>
        <div className="landing-cta">
          <Link href="/register" className="btn btn-primary landing-btn">
            Create account
          </Link>
          <Link href="/login" className="btn btn-ghost landing-btn landing-btn-secondary">
            Sign in
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Woney</span>
        <span>Personal finance for Canada</span>
      </footer>
    </main>
  );
}
