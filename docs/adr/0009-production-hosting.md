# Production hosting stack

## Status

Accepted

## Context

The MVP API and web app ran only on local Docker. Production needs HTTPS API, a browser origin with CORS, managed Postgres, and a mobile client that can reach a non-localhost base URL.

## Decision

- **API + Postgres:** Render Blueprint (`render.yaml`) as the default path; **Fly.io** (`fly.toml`) as an alternative (Toronto `yyz` region).
- **Web:** Vercel from the monorepo root (`vercel.json` install/build for workspaces).
- **Mobile:** Expo Go (tunnel) for immediate phone testing; EAS preview APK / store profiles in `apps/mobile/eas.json`.
- **Security gate:** `WONEY_ENV=production` refuses default JWT/Fernet secrets and requires `WONEY_OPS_TOKEN` + CORS origins (`LEDGER_*` aliases still accepted during rename).
- **Cron:** `POST /v1/ops/sync-all` with `X-Ops-Token` (no user JWT).

## Consequences

Deploy requires account linking (Render/Vercel/Expo) and one-time secret generation documented in `docs/deploy.md`. Local compose remains the developer path with insecure defaults.
