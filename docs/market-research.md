# AI Enabled Budget-er — Market Research

Competitive research for the AI Enabled Budget-er project. Covers top budgeting/planning apps, major bank app features, transaction enrichment options, and security requirements.

## Top budgeting / planning apps (2026)

| App | Price | Positioning | Standout features |
|---|---|---|---|
| Monarch Money | $99.99/yr | Best all-around dashboard (de-facto Mint replacement) | Net worth + investment tracking, couples/household sharing, Flex budgeting, cash-flow projections, **Forecasting** (drag life events on a timeline, watch net-worth projection update), Monarch AI scenario modeling ("what if I retire at 58?") |
| YNAB | $109/yr | Behavior change via zero-based budgeting | Every dollar gets a job, debt payoff focus, strong methodology; steep learning curve, weak visualization |
| Copilot Money | $95/yr | Best design (Apple-first, Android beta) | ML categorization that **learns from user corrections**, budget rollover, natural-language spending queries, best-in-class visuals |
| Rocket Money | Free + $7-14/mo | Busy users, subscription killer | Auto-detects recurring charges, one-tap cancellation, bill negotiation (35-60% cut of savings), "safe to spend" number |
| Cleo | Free + $5.99/mo | Conversational AI coach (Gen-Z voice) | **Autopilot**: agentic goal roadmap, daily plan that recalibrates continuously, soft-blocks overspending categories, auto-moves spare change |
| Empower | Free | Net worth / investment focus | Free aggregation, retirement planner, strongest free tier |
| PocketGuard | $74.99/yr | Simplicity | "In My Pocket" safe-to-spend calculation |
| Quicken Simplifi | $6.99/mo | Beginners | Lightweight, cheap, watchlists |
| Tiller | $109/yr | Spreadsheet power users | Bank feed into Google Sheets/Excel |

Key market facts:

- Mint shut down in 2024; Monarch absorbed most of its user base. The "complete dashboard" segment is the one to beat.
- The market split into tiers: full-stack agentic platforms (Monarch, Copilot, Origin), specialists (Rocket Money, Cleo), rules-based apps with AI bolted on (YNAB, EveryDollar).
- Every serious app charges ~$95-110/yr; free tiers are loss leaders or data plays.

## Bank app features (what users already expect)

| Bank | Assistant | Notable features |
|---|---|---|
| Bank of America | Erica (NLP intent matching, ~700 canned responses — **not** an LLM) | Spending by category, recurring-charge alerts, weekly snapshot, proactive insights, card lock/unlock, 3B+ interactions since launch |
| Capital One | Eno | Unusual-charge alerts, subscription tracking, virtual card numbers |
| Chase | Digital assistant + J.P. Morgan Wealth Plan | Goal setting, budget tracking, credit monitoring, Chase Offers |
| Wells Fargo | Fargo | Spending insights, routine transactions, My Money Map budget/savings suite |
| Ally | - | Savings "buckets", automated savings rules |

Common table stakes: biometric login, card controls, real-time alerts, credit score, Zelle, check deposit. Bank assistants are intent-matchers, not conversational LLMs — a real LLM assistant grounded in the user's actual data is a genuine differentiator.

## Transaction enrichment (the "no vague merchants" problem)

- **Plaid Enrich** (`/transactions/enrich`): send raw descriptor + amount + direction, get back clean merchant name, logo, website, location, counterparties (e.g. resolves "SQ *JOES COFFEE 0421" to Joe's Coffee via Square), and a Personal Finance Category (16 primary / 104 detailed) with confidence level. Works on both Plaid-linked and non-Plaid data. US/CA only.
- **Plaid Transactions** (`/transactions/sync`) already returns cleansed merchant name + PFC for linked accounts.
- **Ntropy**: aggregator-agnostic enrichment API, an alternative/fallback.
- Best practice for "perfect categorization": layered cascade — aggregator PFC -> enrichment API -> LLM resolution for residual unknowns -> user correction feedback loop that trains a per-user override model. Never display a raw alphanumeric descriptor in the UI.

## Security & compliance baseline (from Plaid docs + GLBA/SOC 2 guidance)

- Plaid access tokens: server-side only, never in client code/storage; field-level encryption at rest (KMS envelope encryption), secrets in a secrets manager, rotation plan via `/item/access_token/invalidate`.
- TLS 1.2+ everywhere; OAuth 2.0 + PKCE for mobile/public clients; short-lived JWTs (~15 min) with refresh rotation.
- GLBA Safeguards Rule: written security program, MFA, encryption at rest and in transit (AES-256), audit logging with 2-year retention, annual pen testing.
- SOC 2 Type II readiness: RBAC, incident response plan, vendor risk management, environment separation.
- PCI DSS largely avoided by never touching card PANs (Plaid holds credentials; app never sees them).
- App-level: biometric unlock, device binding, certificate pinning, no sensitive data in logs/analytics, data minimization + user-initiated deletion.

## Differentiators for this app

1. **Perfect categorization** — every transaction resolved to a real merchant + correct category; zero vague/alphanumeric entries surface to the user.
2. **Visualization of every relevant metric** — net worth, cash flow, category trends, merchant drill-down, Sankey income->spending flow, recurring charges, forecasts.
3. **AI assistant** — LLM grounded in the user's real data via tool-calling (unlike Erica's canned responses).
4. **AI budget planner** — looks at income + spending vs. goals and prescribes concrete changes (Cleo Autopilot / Monarch Forecasting territory, but unified).
5. All the best table-stakes features from the apps above.

## Sources

- mypersonalfi.com — Best Budgeting Apps 2026 comparison
- financefernly.com — YNAB vs Monarch vs Rocket Money 2026
- fintechessential.com — 8-app 2026 test
- thepennyhoarder.com — Best Budgeting Apps of 2026
- wallstreetsurvivor.com — Rocket Money vs Monarch
- ledgerwire — AI money coach apps 2026 (Cleo, Monarch AI, Copilot)
- meetcleo.com — Autopilot announcement
- monarch.com — Monarch Plus / Forecasting, June product update
- bankofamerica.com + BofA newsroom — Erica capabilities, 3B interactions
- investopedia.com + greenfi.com — best banking apps 2026
- plaid.com — Enrich product/docs, transactions data update, Core Exchange security best practices
- ntropy docs — transaction enrichment API
- fintegrationfs.com / medium — Plaid token handling + compliance checklists
- onix-systems.com — fintech security best practices 2026
