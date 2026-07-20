# ADR 0002: Modular monolith backend

Status: accepted

## Context

The backend will eventually cover bank sync, enrichment, budgeting, planning, an AI assistant,
and notifications. Microservices from day one would add deployment and consistency overhead with
no payoff at this scale.

## Decision

Single FastAPI deployable, organized by domain package (`auth`, `users`, `households`, later
`connections`, `transactions`, `enrichment`, ...). Each domain owns its models, schemas, service
functions, and router. Cross-domain access goes through service functions, not direct model
imports, so a domain can be extracted into its own service later.

PostgreSQL is the single source of truth. Async SQLAlchemy 2.0 with Alembic migrations. Redis is
introduced when the first background job (transaction sync) lands in slice 2.

## Consequences

- One deployment target and one migration history for now.
- The discipline of routing cross-domain calls through services is enforced by review, not
  tooling; revisit if the module graph gets tangled.
