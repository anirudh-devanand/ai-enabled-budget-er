# ADR 0006: Enrichment cascade design

Status: accepted

## Context

The product's core promise is that no raw bank descriptor ever reaches the UI: every
transaction shows a real merchant and a correct category, or is explicitly flagged for a
one-tap fix that sticks. Without Plaid Enrich (ADR 0005), resolution starts from the raw
Flinks descriptor.

## Decision

A staged cascade over the *normalized* descriptor; first confident stage wins and is recorded
(`stage`, `confidence`) on a `transaction_enrichments` row:

1. **User rules** (`category_rules`) - per-household overrides created from corrections,
   matched exactly on the normalized descriptor. Always win.
2. **Global rules** - ordered regex table in code covering Canadian staples (Tim Hortons,
   Loblaws, PRESTO, Rogers, ...) and bank-side patterns (payroll -> Income, e-transfer ->
   Transfers, NSF -> Fees). Merchant-less patterns categorize without inventing a merchant.
3. **Unresolved** - flagged `needs_review`; the UI surfaces a one-tap correction.

Normalization strips processor prefixes ("SQ *", "POS DEBIT", "PAYPAL *"), store/terminal
numbers, and punctuation noise, so "TIM HORTONS #0455 CALGARY" and "POS DEBIT TIM HORTONS
#7721" share a key. Unresolved transactions still display a prettified descriptor, never the
raw string.

Corrections are the feedback loop: `PATCH /v1/transactions/{id}/category` fixes the row,
upserts a household rule keyed on the normalized descriptor, and re-applies it to all matching
history (never overwriting another explicit correction). The same descriptor cannot be
miscategorized twice for that household.

Planned stages (next slice) slot between 2 and 3: embedding nearest-neighbour over previously
resolved descriptors, then LLM resolution for the residual, each with confidence thresholds.

## Consequences

- Deterministic and free for the common case; the LLM only ever sees the long tail.
- Global rules live in code, so improving coverage is a PR with tests, not a data migration.
- Exact-match user rules are conservative: a new store number for the same merchant normalizes
  to the same key, but a genuinely different descriptor needs one more tap. The embedding
  stage will close that gap.
