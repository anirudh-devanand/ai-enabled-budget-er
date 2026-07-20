# ADR 0005: Flinks over Plaid for bank aggregation

Status: accepted

## Context

The original plan assumed Plaid. The primary market for this product is Canada, and coverage of
Canadian fintechs matters - Neo Financial in particular, plus EQ Bank, Wealthsimple, and the big
five banks. Flinks is a Canadian aggregator with first-class coverage of these institutions
(Wealthsimple itself uses Flinks for account linking); Plaid's Canadian fintech coverage is
thinner.

## Decision

Use Flinks as the aggregation provider:

- Frontend embeds the Flinks Connect iframe; the `REDIRECT` postMessage event yields a `loginId`.
- Backend exchanges `loginId` for a `requestId` via `/Authorize`, then pulls accounts and up to
  365 days of transactions via `/GetAccountsDetail`, polling `/GetAccountsDetailAsync` on 202
  responses (long-running jobs).
- The `loginId` is treated like a Plaid access token: server-side only, field-level encrypted.
- All Flinks specifics live behind a `BankProvider` protocol (`fetch_snapshot(login_id)`), so an
  alternate or additional aggregator can be added without touching sync logic. The dev default
  points at the public Flinks sandbox (toolbox) instance.

## Consequences

- Categorization (next slice) cannot rely on Plaid's personal-finance categories or Plaid
  Enrich. The enrichment cascade starts from raw descriptors: rules -> embeddings -> LLM ->
  user feedback. Flinks Enrich can slot in behind the provider interface later if needed.
- Flinks has no webhook-driven incremental sync like Plaid's `/transactions/sync` cursor;
  refreshes are pull-based (`/sync` endpoint now, scheduled nightly refresh later).
- US expansion would likely add a second provider behind the same interface.
