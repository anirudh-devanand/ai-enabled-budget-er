# Hosting rename checklist — Ledger → Woney

Code now uses **Woney** branding and the **`WONEY_`** env prefix. Existing **`LEDGER_*`**
env vars still work (copied into `WONEY_*` at boot when `WONEY_*` is unset). You still must
rename cloud resources and DNS yourself — those cannot be done from this repo alone.

Intended hostnames after rename (adjust if your dashboard assigns a different suffix):

| Role | Old | New (target) |
|------|-----|----------------|
| Render web service | `ledger-api` → `https://ledger-api-ayer.onrender.com` | `woney-api` → copy **exact** URL from Dashboard (may stay `ledger-api-ayer` or become `woney-api-….onrender.com`) |
| Render Postgres | `ledger-db` (DB/user `ledger`) | Display rename to `woney-db` only. Keep DB/user `ledger`. Do **not** recreate the database. If you mistyped `wpney-db`, rename to `woney-db`. |
| Vercel project | `ledger-web` → `https://ledger-web-blue.vercel.app` | `woney-web` → `https://woney-web-blue.vercel.app` (or keep old URL if Vercel preserves it) |
| Fly app (if used) | `ledger-api` | `woney-api` (`fly apps rename` or new app) |
| GitHub repo | `ai-enabled-budget-er` | Optional rename on GitHub only — folder/clone path unchanged here |

**Live check (2026-07-24):** `https://ledger-api-ayer.onrender.com/healthz` still returns OK.
`https://woney-api-ayer.onrender.com` was not reachable — always copy the hostname from the
Render service page after rename before updating Vercel / EAS.

## Blueprint desync (why services look “unmanaged”)

Render Blueprints track resources by the **`name:` values in `render.yaml`**, not by
dashboard-only renames. If you rename `ledger-api` → `woney-api` (and `ledger-db` →
`woney-db`) in the Dashboard while `render.yaml` still says `ledger-*`, those resources
become orphaned from the Blueprint (still running, but not Blueprint-managed).

### Safe re-link (preferred)

1. Confirm exact Dashboard names: `woney-api` and `woney-db` (fix `wpney-db` → `woney-db`).
2. Ensure repo `render.yaml` uses those same `name:` fields (this repo already does).
   Keep `databaseName` / `user` as **`ledger`** so Blueprint does not imply a new empty DB.
3. Push to the branch linked to the Blueprint.
4. Render Dashboard → your **Blueprint** → **Manual Sync** (or wait for Auto Sync).
5. Render matches **by exact name** and re-adopts existing services/DBs — it does not need
   a separate “Adopt” button when names already match ([Blueprint docs](https://render.com/docs/infrastructure-as-code)).
6. Confirm both resources show as managed by the Blueprint again. Redeploy API if needed.
7. Env vars already on the service (`LEDGER_*` or `WONEY_*`) keep working whether or not
   Blueprint manages the service; `sync: false` secrets are not overwritten on sync.

### If Sync still does not re-attach

| Option | When | Risk |
|--------|------|------|
| **(a)** Rename Dashboard names **back** to `ledger-api` / `ledger-db`, sync with old yaml, then change yaml + rename together in one coordinated push/sync | Blueprint stubbornly won’t match | Low if careful |
| **(b)** Leave services unmanaged; keep Git auto-deploy / manual deploys on the web service | Blueprint IaC not required day-to-day | Low — env vars still work |
| **(c)** Delete Blueprint-managed copies and recreate | **Never delete Postgres** to “fix” Blueprint | **Dangerous — data loss** |

**Never** delete `woney-db` / the Postgres instance to force a clean Blueprint.

## 1. Render (API)

1. Deploy a commit that accepts both `LEDGER_*` and `WONEY_*` (this rename series).
2. Prefer aligning Blueprint names (section above) over creating a second API service.
3. If you already renamed in the Dashboard:
   - Copy the live `*.onrender.com` URL from the service page (do not assume `-ayer`).
   - Env vars — either leave `LEDGER_*` (still works) or duplicate then switch:
   - Add `WONEY_ENV`, `WONEY_DATABASE_URL`, `WONEY_JWT_SECRET`, `WONEY_DATA_ENCRYPTION_KEY`, `WONEY_OPS_TOKEN`, `WONEY_CORS_ORIGINS`, plus any `WONEY_PLAID_*` / `WONEY_*_OAUTH_*` / `WONEY_LLM_API_KEY` / `WONEY_RESEND_*` you use.
   - Copy values from the matching `LEDGER_*` keys (do not regenerate JWT/Fernet unless you intend to invalidate sessions / re-encrypt TOTP).
   - Set `WONEY_CORS_ORIGINS` to include **all** live web origins during cutover, e.g.  
     `https://woneyai.vercel.app,https://woney-web-blue.vercel.app,https://ledger-web-blue.vercel.app`  
     (API code also merges these known hosts so a stale Render env cannot hide SSO.)
   - Set `WONEY_OAUTH_REDIRECT_URI` / Google Console redirect to  
     `https://woneyai.vercel.app/login/oauth/callback` (providers endpoint prefers request Origin when allowed).
   - After clients point only at Woney hosts, remove the old origin and delete unused `LEDGER_*` keys.
4. Confirm `GET https://<actual-api-host>/healthz` → `status: ok`, `database: up`.

**Do not** delete the managed Postgres or run a destructive Blueprint recreate — that drops data.

## 2. Vercel (web)

1. Project Settings → rename project to `woney-web` (or create `woney-web` and reconnect the repo).
2. Note the production URL (may stay `ledger-web-blue.vercel.app` or become `woney-web-*.vercel.app`).
3. Env:
   - `NEXT_PUBLIC_API_URL` = live API host from Render (no trailing slash). Until a new
     `woney-api-*.onrender.com` responds, keep `https://ledger-api-ayer.onrender.com`.
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
