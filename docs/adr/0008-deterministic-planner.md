# ADR 0008: Deterministic planner math

Status: accepted

## Context

The AI budget planner must prescribe concrete cuts and timelines. Letting an LLM do arithmetic
is a known failure mode for finance products.

## Decision

All projections live in `app/planner/engine.py`: months remaining, monthly amount needed,
on-track/gap, scenario surplus, and recommended cuts (largest discretionary categories,
capped at 20% each, housing/utilities protected). The LLM (when present) may only narrate
these numbers; APIs always return engine outputs.

## Consequences

- Plans are reproducible and unit-testable without an API key.
- Cut heuristics are deliberately simple; a later slice can learn per-user preferences.
