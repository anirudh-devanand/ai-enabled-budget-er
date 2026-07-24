"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/** Continuously looping hero product plane — distinct from Bank Sync section. */
function HeroScene() {
  return (
    <div className="landing-scene landing-scene--hero" aria-hidden>
      <div className="landing-scene-glow landing-hero-glow" />
      <div className="landing-scene-panel landing-hero-panel">
        <div className="landing-hero-top">
          <p className="landing-scene-label">Available</p>
          <p className="landing-scene-amount landing-hero-amount">
            <span className="landing-hero-currency">$</span>
            <span className="landing-hero-digits">8,642.15</span>
          </p>
          <p className="landing-hero-delta">
            <span className="landing-hero-delta-pill">+2.4%</span>
            <span>this month</span>
          </p>
        </div>

        <div className="landing-hero-ring-wrap">
          <svg className="landing-hero-ring" viewBox="0 0 120 120">
            <circle className="landing-hero-ring-track" cx="60" cy="60" r="48" />
            <circle className="landing-hero-ring-progress" cx="60" cy="60" r="48" />
          </svg>
          <div className="landing-hero-ring-label">
            <span>Budget</span>
            <strong>68%</strong>
          </div>
        </div>

        <ul className="landing-hero-feed">
          <li className="landing-hero-feed-item" style={{ ["--i" as string]: 0 }}>
            <span className="landing-hero-feed-dot" style={{ background: "#6b8f71" }} />
            <span>Groceries</span>
            <span>−$42.18</span>
          </li>
          <li className="landing-hero-feed-item" style={{ ["--i" as string]: 1 }}>
            <span className="landing-hero-feed-dot" style={{ background: "#5c7a8a" }} />
            <span>Transit</span>
            <span>−$3.75</span>
          </li>
          <li className="landing-hero-feed-item" style={{ ["--i" as string]: 2 }}>
            <span className="landing-hero-feed-dot" style={{ background: "#b89a4a" }} />
            <span>Interest</span>
            <span className="in">+$12.40</span>
          </li>
          <li className="landing-hero-feed-item" style={{ ["--i" as string]: 3 }}>
            <span className="landing-hero-feed-dot" style={{ background: "#9a6b5c" }} />
            <span>Dining</span>
            <span>−$28.90</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Static Bank Sync visual — accounts + institutions, not the hero mock. */
function BankSyncScene() {
  return (
    <div className="landing-scene landing-scene--section" aria-hidden>
      <div className="landing-scene-glow" />
      <div className="landing-scene-panel landing-banks-panel">
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
        <HeroScene />
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
      </section>

      <section className="landing-block" data-reveal>
        <div className="landing-block-inner">
          <p className="landing-kicker">Bank sync</p>
          <h2 className="landing-block-title">Your Canadian accounts, in one quiet place.</h2>
          <p className="landing-block-copy">
            Connect the banks you already use. Balances and transactions stay current so you can see
            the full picture without spreadsheet chaos.
          </p>
        </div>
        <div className="landing-block-visual" data-reveal>
          <BankSyncScene />
        </div>
      </section>

      <section className="landing-block landing-block-flip" data-reveal>
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
