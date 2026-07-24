# ADR 0010: Plaid + CSV instead of paid Flinks Connect

Status: accepted  
Supersedes parts of ADR 0005 for production linking cost.

## Context

Flinks Connect requires an enterprise-style monthly minimum (~$500/mo). That is not viable for
an indie / portfolio product. Neo Financial remains poorly covered by Plaid, so a pure-Plaid
approach would leave a Canadian fintech gap.

## Decision

1. **Primary live aggregator: Plaid** (sandbox free; Trial / pay-as-you-go for real Canadian
   big-five banks). Link tokens are created server-side; access tokens are encrypted at rest
   behind the existing `BankProvider` interface.
2. **CSV statement import** for Neo and any unsupported institution — no aggregator fee.
3. **Demo seed** (`demo-seed:…`) remains for QA and recruiter demos.
4. **Flinks code stays** behind the composite provider for a future paid path; it is not required
   to run the product.

## Consequences

- Connect UI offers three tabs: Plaid Link, CSV import, Demo data.
- Env: `WONEY_PLAID_CLIENT_ID`, `WONEY_PLAID_SECRET`, `WONEY_PLAID_ENV` (`sandbox` |
  `production`).
- Neo users import statements until Flinks (or another CA-native aggregator) becomes affordable.
- Plaid amount sign is inverted to match our positive=inflow convention.
