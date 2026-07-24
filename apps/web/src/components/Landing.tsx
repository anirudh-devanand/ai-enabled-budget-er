"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

function ProductScene({ variant = "hero" }: { variant?: "hero" | "section" }) {
  return (
    <div className={`landing-scene landing-scene--${variant}`} aria-hidden>
      <div className="landing-scene-glow" />
      <div className="landing-scene-panel">
        <p className="landing-scene-label">Cash</p>
        <p className="landing-scene-amount">$12,480.60</p>
        <div className="landing-scene-bars">
          <span style={{ width: "72%" }} />
          <span style={{ width: "48%" }} />
          <span style={{ width: "61%" }} />
        </div>
        <ul className="landing-scene-rows">
          <li>
            <span>Groceries</span>
            <span>−$86.40</span>
          </li>
          <li>
            <span>Transit</span>
            <span>−$24.00</span>
          </li>
          <li>
            <span>Paycheque</span>
            <span className="in">+$2,150.00</span>
          </li>
        </ul>
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
        <ProductScene variant="hero" />
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
          <ProductScene variant="section" />
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
