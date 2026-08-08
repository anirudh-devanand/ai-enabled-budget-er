# ADR 0014: SnapTrade for brokerages (Wealthsimple / IBKR)

Status: accepted  
Related: ADR 0010 (Plaid + CSV for banks)

## Context

Canadian brokerage holdings (Wealthsimple, Interactive Brokers) are poorly served by
Plaid’s `investments` product for many CA institutions. Woney’s bank path stays on Plaid
`transactions`; portfolio positions need a brokerage-native aggregator.

## Decision

1. **SnapTrade Commercial** for brokerage connect (read-only Connection Portal).
2. One SnapTrade user per Woney user (`snaptrade_user_id` + encrypted `userSecret`).
3. Persist positions in `holdings`; account `balance` = total equity for net worth.
4. Investment activities map into `transactions` when SnapTrade returns them.
5. Connect UI tab **Brokerages** alongside Plaid / CSV / Demo.

## Consequences

- Env: `WONEY_SNAPTRADE_CLIENT_ID`, `WONEY_SNAPTRADE_CONSUMER_KEY` on the API (Render).
- Alembic `0014_snaptrade_holdings`.
- IBKR users must create a Flex Query token in IBKR Third-Party Services.
- Wealthsimple uses credential login inside the SnapTrade portal (may need reconnect after password/MFA changes).
- No trading from Woney.
