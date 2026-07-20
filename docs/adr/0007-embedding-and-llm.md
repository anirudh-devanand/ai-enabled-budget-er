# ADR 0007: Offline-first embedding stage + optional LLM

Status: accepted

## Context

Slice 3 left residual descriptors as `unresolved`. Slice 4 needs nearest-neighbour matching
and LLM resolution without requiring pgvector or a paid API key for local/dev demos.

## Decision

1. Store resolved descriptors in `descriptor_embeddings` with a deterministic character
   n-gram + token vector (JSON), scoped globally (from global rules) or per-household
   (from corrections / LLM).
2. Match primarily by **content-token Jaccard** (Canadian city/province noise stripped),
   with cosine as a tie-break. Require at least two shared content tokens. This catches
   "BLUE BOTTLE ROASTERS VAN" -> "BLUE BOTTLE COFFEE TORONTO" without an external model.
3. LLM enrichment is optional via `LEDGER_LLM_API_KEY` (Anthropic Messages API). When unset,
   the stage is a no-op and the cascade falls through to `unresolved`.
4. The assistant uses the same gateway: with no key it still answers from live tools
   (net worth, spending, budgets, goals); with a key it runs a real tool-calling loop.

## Consequences

- No pgvector dependency; works on SQLite test DBs and Postgres alike.
- Token overlap can false-positive on short shared words; the two-token minimum and noise
  list mitigate this. Swap in a real embedding API later behind `embed_text()` if needed.
- Production demos of LLM narration need `LEDGER_LLM_API_KEY`; everything else works offline.
