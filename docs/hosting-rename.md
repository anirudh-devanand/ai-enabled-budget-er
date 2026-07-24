# Hosting rename checklist — Ledger → Woney

Code now uses **Woney** branding and the **`WONEY_`** env prefix. Existing **`LEDGER_*`**
env vars still work (copied into `WONEY_*` at boot when `WONEY_*` is unset). You still must
rename cloud resources and DNS yourself — those cannot be done from this repo alone.

Intended hostnames after rename (adjust if your dashboard assigns a different suffix):

| Role | Old | New (target) |
|------|-----|----------------|
| Render web service | `ledger-api` → `https://ledger-api-ayer.onrender.com` | `woney-api` → `https://woney-api-ayer.onrender.com` |
| Render Postgres | `ledger-db` (DB/user `ledger`) | Keep existing DB data; optional display rename to `woney-db`. Do **not** recreate the database. |
| Vercel project | `ledger-web` → `https://ledger-web-blue.vercel.app` | `woney-web` → `https://woney-web-blue.vercel.app` (or keep old URL if Vercel preserves it) |
| Fly app (if used) | `ledger-api` | `woney-api` (`fly apps rename` or new app) |
| GitHub repo | `ai-enabled-budget-er` | Optional rename on GitHub only — folder/clone path unchanged here |

## 1. Render (API)

1. Deploy this commit first so the API accepts both `LEDGER_*` and `WONEY_*`.
2. In the service (currently `ledger-api`):
   - **Settings → Name** → rename display name to `woney-api` if Render allows (URL may change — copy the new `*.onrender.com` URL).
   - Or create a new `woney-api` service pointing at the same repo/Dockerfile and attach the **existing** Postgres — then retire `ledger-api`. Prefer attach-existing over wiping data.
3. Env vars — either leave `LEDGER_*` (still works) or duplicate then switch:
   - Add `WONEY_ENV`, `WONEY_DATABASE_URL`, `WONEY_JWT_SECRET`, `WONEY_DATA_ENCRYPTION_KEY`, `WONEY_OPS_TOKEN`, `WONEY_CORS_ORIGINS`, plus any `WONEY_PLAID_*` / `WONEY_*_OAUTH_*` / `WONEY_LLM_API_KEY` / `WONEY_RESEND_*` you use.
   - Copy values from the matching `LEDGER_*` keys (do not regenerate JWT/Fernet unless you intend to invalidate sessions / re-encrypt TOTP).
   - Set `WONEY_CORS_ORIGINS` to include **both** web origins during cutover, e.g.  
     `https://woney-web-blue.vercel.app,https://ledger-web-blue.vercel.app`
   - After clients point only at Woney hosts, remove the old origin and delete unused `LEDGER_*` keys.
4. Confirm `GET https://<new-or-old-api-host>/healthz` → `status: ok`, `database: up`.

**Do not** delete the managed Postgres or run a destructive Blueprint recreate — that drops data.

## 2. Vercel (web)

1. Project Settings → rename project to `woney-web` (or create `woney-web` and reconnect the repo).
2. Note the production URL (may stay `ledger-web-blue.vercel.app` or become `woney-web-*.vercel.app`).
3. Env:
   - `NEXT_PUBLIC_API_URL` = new API host (no trailing slash), e.g. `https://woney-api-ayer.onrender.com`
4. Redeploy production.
5. If you use a custom domain (`woney.app` etc.): point DNS / Vercel domain to the renamed project; keep the old Vercel URL in CORS until DNS propagates.

## 3. Clients that hardcode hosts

After the real URLs are known, update if they differ from the targets in this repo:

- Vercel env `NEXT_PUBLIC_API_URL`
- Render `WONEY_CORS_ORIGINS` / `WONEY_OAUTH_REDIRECT_URI`
- `apps/mobile/eas.json` → `EXPO_PUBLIC_API_URL`
- Mobile `EXPO_PUBLIC_WEB_URL` (Connect deep-link)
- OAuth provider consoles (Google / Apple / Microsoft) — authorized redirect URIs must match the live web callback URL

## 4. DNS / custom domain

1. Apex/www → Vercel project (Woney web).
2. Optional `api.` subdomain → Render service (or CNAME to `*.onrender.com`).
3. Update CORS and `NEXT_PUBLIC_API_URL` / mobile env to the custom domain once TLS is green.
4. Remove temporary dual CORS origins after cutover.

## 5. GitHub (optional)

Rename the repository in GitHub settings if you want the remote named `woney`. Update local `git remote set-url`. This monorepo folder can stay `ai-enabled-budget-er`.

## 6. Local Docker

`docker-compose.yml` now uses Postgres user/db `woney`. Existing volumes created as `ledger` need a reset:

```bash
docker compose down -v
docker compose up --build
```

## Cutover order (safe)

1. Ship code (this commit) — dual env prefix + dual CORS defaults.
2. Point Vercel `NEXT_PUBLIC_API_URL` at the API you will keep (old URL is fine until renamed).
3. Rename/create Render + Vercel resources; update CORS to both URLs.
4. Switch mobile EAS / Expo env to the new API URL; rebuild.
5. Update OAuth redirect URIs.
6. Drop `LEDGER_*` env vars and legacy CORS origins when nothing hits the old hosts.
