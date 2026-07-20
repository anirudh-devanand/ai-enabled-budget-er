# Ledger

Personal finance platform for Canada: live bank sync (including fintechs like Neo Financial and
EQ Bank via Flinks), transaction categorization that never shows a vague merchant, rich
visualizations, and an AI budget planner. iOS + Android + web on one backend.

**Status:** early development. Auth and bank sync are working end to end; the categorization
pipeline is next.

## What works today

- Email/password registration and login with argon2id hashing
- Short-lived access tokens (15 min) + rotating refresh tokens with server-side sessions,
  logout, and logout-all-devices
- TOTP two-factor auth: enroll, activate, and challenge on login
- Households with owner/member roles; a personal household is created on signup
- Bank connections via the Flinks Connect widget: link any supported Canadian institution and
  pull accounts + up to 365 days of transactions; idempotent re-sync on demand
- Web app (Next.js): register, sign in (incl. MFA challenge), connect a bank, dashboard with
  balances and recent transactions
- Mobile app (Expo): sign-in flow with refresh tokens in the platform keychain
- Shared TypeScript API client used by both frontends

## Architecture

```mermaid
flowchart LR
    subgraph clients [Clients]
        web[Next.js web]
        mobile[Expo iOS / Android]
    end
    client[shared TS api-client]
    api[FastAPI backend]
    pg[(PostgreSQL)]
    flinks[Flinks aggregation]
    banks[(Banks & fintechs<br/>Neo, EQ, big five)]

    web --> client
    mobile --> client
    client -->|HTTPS + JWT| api
    api --> pg
    api -->|Authorize / GetAccountsDetail| flinks
    flinks --> banks
```

The backend is a modular monolith (domain packages: `auth`, `users`, `households`, with
`connections`, `transactions`, `enrichment`, `budgets`, `planner` planned). Details and ERD in
[docs/architecture.md](docs/architecture.md); decisions in [docs/adr/](docs/adr/).

## Run it

Backend + database:

```bash
docker compose up --build
# API on http://localhost:8000, docs at /docs
```

Or natively:

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head   # needs LEDGER_DATABASE_URL pointing at Postgres
uvicorn app.main:app --reload
```

Web:

```bash
npm install --workspace packages/api-client --workspace apps/web
npm run dev --workspace apps/web
# http://localhost:3000
```

Bank sync points at the public Flinks sandbox by default (fake institutions, no keys needed).
For a real instance set `LEDGER_FLINKS_BASE_URL`, `LEDGER_FLINKS_CUSTOMER_ID`, and
`LEDGER_FLINKS_AUTH_KEY` on the backend, plus `NEXT_PUBLIC_FLINKS_IFRAME_URL` on the web app.

Tests:

```bash
cd backend
python -m pytest -q
```

## Docs

- [Architecture + ERD](docs/architecture.md)
- [ADRs](docs/adr/)
- [Market research](docs/market-research.md)

## Roadmap

1. ~~Auth, users, households~~ (done)
2. ~~Flinks bank connections + transaction sync~~ (done)
3. Categorization pipeline (rules -> embeddings -> LLM -> user feedback loop); raw descriptors
   stop appearing in the UI once this lands
4. Budgets and core visualizations (net worth, cash flow, category trends, Sankey)
5. AI assistant with tool-calling
6. AI budget planner with goal re-forecasting and scenario modeling
7. Scheduled nightly re-sync, notifications, household sharing, hardening
