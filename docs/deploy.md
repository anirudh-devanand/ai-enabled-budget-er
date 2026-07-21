# Production deploy — Ledger

Host the API on **Render** (Blueprint) or **Fly.io**, and the web app on **Vercel**.
Mobile reaches the same public HTTPS API via `EXPO_PUBLIC_API_URL`.

## 1. Backend (Render Blueprint — recommended)

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select the repo.
3. Set these secrets when prompted (or after create):
   - `LEDGER_DATA_ENCRYPTION_KEY` — `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
   - `LEDGER_CORS_ORIGINS` — your Vercel URL, e.g. `https://ledger-xxx.vercel.app`
4. Render generates `LEDGER_JWT_SECRET` and `LEDGER_OPS_TOKEN`.
5. **Important:** Render Postgres connection strings use `postgres://`; rewrite to
   `postgresql+asyncpg://...` (replace scheme) in `LEDGER_DATABASE_URL`.
6. Confirm `https://<api-host>/healthz` returns `{"status":"ok","database":"up"}`.

### Alternative: Fly.io

```bash
fly launch --config fly.toml --no-deploy
fly postgres create --name ledger-db --region yyz
fly postgres attach ledger-db -a ledger-api
fly secrets set LEDGER_ENV=production \
  LEDGER_JWT_SECRET="$(openssl rand -hex 32)" \
  LEDGER_DATA_ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" \
  LEDGER_OPS_TOKEN="$(openssl rand -hex 24)" \
  LEDGER_CORS_ORIGINS="https://YOUR_VERCEL_URL"
# Fix DATABASE_URL scheme to postgresql+asyncpg:// if needed
fly deploy
```

## 2. Web (Vercel)

1. Import the monorepo in Vercel; root directory = repo root (uses `vercel.json`).
2. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://<your-api-host>` (no trailing slash)
   - `NEXT_PUBLIC_FLINKS_IFRAME_URL` = your Flinks Connect iframe URL (sandbox or prod)
3. Deploy. Update API `LEDGER_CORS_ORIGINS` to the Vercel production URL and redeploy API if needed.

## 3. Cron (optional)

```bash
curl -X POST "https://<api-host>/v1/ops/sync-all" -H "X-Ops-Token: $LEDGER_OPS_TOKEN"
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
