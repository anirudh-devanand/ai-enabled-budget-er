# Production deploy — Woney

Host the API on **Render** (Blueprint) or **Fly.io**, and the web app on **Vercel**.
Mobile reaches the same public HTTPS API via `EXPO_PUBLIC_API_URL`.

Env prefix is **`WONEY_`**. Legacy **`LEDGER_*`** names still work until you migrate
(see [hosting-rename.md](hosting-rename.md)).

## 1. Backend (Render Blueprint — recommended)

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select the repo
   (or open the existing Blueprint and **Manual Sync** after `render.yaml` changes).
3. Blueprint resource names are `woney-api` and `woney-db` — they must match Dashboard names
   exactly to stay managed (see [hosting-rename.md](hosting-rename.md) if you renamed in UI first).
4. Set these secrets when prompted (or after create):
   - `WONEY_DATA_ENCRYPTION_KEY` — `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
   - `WONEY_CORS_ORIGINS` — your Vercel URL(s), e.g. `https://woney-web-blue.vercel.app` (include the old `ledger-web-*` origin during rename)
5. Render generates `WONEY_JWT_SECRET` and `WONEY_OPS_TOKEN`. Existing service env vars
   (including legacy `LEDGER_*`) keep working even if Blueprint briefly shows unmanaged.
6. **Important:** Render Postgres connection strings use `postgres://`; the Docker entrypoint
   rewrites to `postgresql+asyncpg://...` for `WONEY_DATABASE_URL` (and legacy `LEDGER_DATABASE_URL`).
7. Confirm `https://<api-host>/healthz` returns `{"status":"ok","database":"up"}`.

### Alternative: Fly.io

```bash
fly launch --config fly.toml --no-deploy
fly postgres create --name woney-db --region yyz
fly postgres attach woney-db -a woney-api
fly secrets set WONEY_ENV=production \
  WONEY_JWT_SECRET="$(openssl rand -hex 32)" \
  WONEY_DATA_ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" \
  WONEY_OPS_TOKEN="$(openssl rand -hex 24)" \
  WONEY_CORS_ORIGINS="https://YOUR_VERCEL_URL"
# Fix DATABASE_URL scheme to postgresql+asyncpg:// if needed
fly deploy
```

## 2. Web (Vercel)

1. Import the monorepo in Vercel; root directory = repo root (uses `vercel.json`).
2. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://<your-api-host>` (no trailing slash)
   - `NEXT_PUBLIC_FLINKS_IFRAME_URL` = your Flinks Connect iframe URL (sandbox or prod)
3. Deploy. Update API `WONEY_CORS_ORIGINS` to the Vercel production URL and redeploy API if needed.

## 3. Cron (optional)

```bash
curl -X POST "https://<api-host>/v1/ops/sync-all" -H "X-Ops-Token: $WONEY_OPS_TOKEN"
```

Schedule every 6–12 hours (Render Cron Job, GitHub Actions, or Fly Machines).

## 4. Mobile on your phone

### Fast path — Expo Go

```bash
cd apps/mobile
# set EXPO_PUBLIC_API_URL to the public API (same as web)
npx expo start --tunnel
```

Install **Expo Go** on your phone, scan the QR code. Sign in against production.

### Store / installable build — EAS

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli build:configure   # already has eas.json
npx eas-cli build -p android --profile preview   # APK installable
npx eas-cli build -p ios --profile preview       # needs Apple Developer account
```

Set `EXPO_PUBLIC_API_URL` in EAS secrets / `eas.json` env for production profile.

## Checklist

- [ ] `/healthz` OK on public API
- [ ] Web login works (CORS)
- [ ] Mobile Expo Go reaches API over HTTPS
- [ ] Secrets are not the repo defaults
- [ ] Ops token only known to cron
- [ ] After rebrand: follow [hosting-rename.md](hosting-rename.md)
