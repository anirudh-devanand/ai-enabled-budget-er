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
   - `WONEY_CORS_ORIGINS` — your Vercel URL(s), e.g. `https://woneyai.vercel.app,https://woney-web-blue.vercel.app,https://ledger-web-blue.vercel.app`
   - `WONEY_OAUTH_REDIRECT_URI` — `https://woneyai.vercel.app/login/oauth/callback` (also add this URI in Google Cloud Console)
   - `WONEY_PUBLIC_APP_URL` — `https://woneyai.vercel.app` (password-reset email links)
   - `WONEY_RESEND_API_KEY` + `WONEY_EMAIL_FROM` — optional; needed for real password-reset / deletion / **login MFA email OTP** emails (see §1c)
5. Render generates `WONEY_JWT_SECRET` and `WONEY_OPS_TOKEN`. Existing service env vars
   (including legacy `LEDGER_*`) keep working even if Blueprint briefly shows unmanaged.
6. **Important:** Render Postgres connection strings use `postgres://`; the Docker entrypoint
   rewrites to `postgresql+asyncpg://...` for `WONEY_DATABASE_URL` (and legacy `LEDGER_DATABASE_URL`).
7. Confirm `https://<api-host>/healthz` returns `{"status":"ok","database":"up"}`.

## 1c. Alembic `0013` + Resend (login MFA email)

Migration `0013_mfa_login_challenges` creates the `mfa_login_challenges` table used for
email OTP on sign-in. The API Docker entrypoint already runs `alembic upgrade head` on
**every** container start (`backend/docker-entrypoint.sh`), so a normal deploy of a build
that includes revision `0013` applies it automatically.

### Apply migration `0013` on Render

**Preferred (automatic):**

1. Merge/push the commit that adds `backend/alembic/versions/0013_mfa_login_challenges.py`.
2. [Render Dashboard](https://dashboard.render.com) → service **`woney-api`** (or your API name) → **Manual Deploy** → **Deploy latest commit**.
3. Watch deploy logs for `alembic upgrade head` succeeding (no `Can't locate revision` / DB errors).
4. Optional check — Render Shell (or local against prod URL only for health): after boot, login MFA should stop failing with missing-table errors.

**Manual (only if you need to run Alembic without a full redeploy):**

1. Dashboard → **`woney-api`** → **Shell**.
2. From the app working directory (usually `/app` in the image):

```bash
alembic upgrade head
# or specifically:
# alembic upgrade 0013_mfa_login_challenges
alembic current
```

Expect `current` to show `0013_mfa_login_challenges` (or a later head).

**Local (dev Postgres):**

```bash
cd backend
alembic upgrade head
# or: alembic upgrade 0013_mfa_login_challenges
```

### Set Resend env vars on Render

Without both vars, `/healthz` reports `"email_configured": false` and production login MFA
cannot send real email OTPs (dev may expose `dev_code` when Resend is unset).

| Variable | Example | Notes |
|---|---|---|
| `WONEY_RESEND_API_KEY` | `re_...` | From [Resend](https://resend.com) → API Keys |
| `WONEY_EMAIL_FROM` | `Woney <noreply@yourdomain.com>` | Must be a verified domain/sender in Resend |

Legacy aliases still work if `WONEY_*` is unset: `LEDGER_RESEND_API_KEY`, `LEDGER_EMAIL_FROM`.

**Clicks:**

1. Resend dashboard → create API key → verify sending domain → note From address.
2. Render → **`woney-api`** → **Environment** → **Add Environment Variable** (or edit):
   - Key `WONEY_RESEND_API_KEY` → paste key (mark secret).
   - Key `WONEY_EMAIL_FROM` → e.g. `Woney <noreply@yourdomain.com>`.
3. **Save Changes**.
4. **Manual Deploy** (or restart) so the running process reloads env — env edits alone do not always restart free-tier services.
5. Verify:

```bash
curl -s https://<api-host>/healthz
# expect "email_configured": true
```

Also used for: password-reset links, account-deletion OTPs, and login MFA codes
(`send_login_mfa_code` in `backend/app/account/email.py`).

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

## 1b. Plaid (Render API — not Vercel)

Plaid Link tokens are created by the **API**. Secrets must live on the **Render** web
service (`ledger-api-ayer` / `woney-api`), then **Manual Deploy** so the process picks them up.

| Variable | Required | Notes |
|---|---|---|
| `WONEY_PLAID_CLIENT_ID` | yes | Or legacy `LEDGER_PLAID_CLIENT_ID` (alias still works) |
| `WONEY_PLAID_SECRET` | yes | Or legacy `LEDGER_PLAID_SECRET` |
| `WONEY_PLAID_ENV` | recommended | `sandbox` \| `development` \| `production` |
| `WONEY_PLAID_COUNTRY_CODES` | optional | default `CA` |

You only need **one** prefix (`WONEY_*` preferred). If both are set, `WONEY_*` wins.
Putting `LEDGER_PLAID_*` / `WONEY_PLAID_*` on **Vercel alone does nothing** for
`plaid_configured` — Vercel only needs `NEXT_PUBLIC_API_URL`.

Verify:

```bash
curl -s https://ledger-api-ayer.onrender.com/healthz
# expect "plaid_configured": true
```

## 2. Web (Vercel)

1. Import the monorepo in Vercel; root directory = repo root (uses `vercel.json`).
2. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://<your-api-host>` (no trailing slash) — e.g. `https://ledger-api-ayer.onrender.com`
   - Do **not** put Plaid client id/secret here; they belong on Render (section 1b)
3. Deploy. Update API `WONEY_CORS_ORIGINS` to the Vercel production URL and redeploy API if needed.
   CSP in `apps/web/next.config.ts` must allow `https://cdn.plaid.com` in `script-src`
   (and frame/connect) or the connect page cannot load Plaid Link.

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

- [ ] `/healthz` OK on public API (`email_configured: true` if using Resend / login MFA email)
- [ ] Web login works (CORS); MFA lands on `/login/mfa`
- [ ] Mobile Expo Go reaches API over HTTPS
- [ ] Secrets are not the repo defaults
- [ ] Ops token only known to cron
- [ ] After rebrand: follow [hosting-rename.md](hosting-rename.md)
