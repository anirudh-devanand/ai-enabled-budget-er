# ADR 0001: Monorepo and platform stack

Status: accepted

## Context

The product ships on iOS, Android, and web with one backend. A solo developer maintains all of
it, so duplicated logic across platforms is the main risk to velocity.

## Decision

- One repository holding `apps/web` (Next.js, App Router, TypeScript), `apps/mobile`
  (Expo React Native), `packages/api-client` (shared TS client), and `backend/` (FastAPI).
- npm workspaces for JS package management (no extra tooling to install); adopt Turborepo later
  if the task graph grows. The Python backend is a separate CI job with its own venv.
- Expo over separate Swift/Kotlin apps: one codebase covers both stores, and the features here
  (dashboards, chat, forms) do not need custom native rendering. Native modules remain available
  for biometrics and secure storage.
- Next.js web app is a full product with the same feature set as mobile.

## Consequences

- Shared API types live in `packages/api-client` and are consumed by both frontends; drift
  between clients is caught at compile time.
- Two toolchains (pnpm + Python venv) in one repo; CI keeps them in separate jobs.
