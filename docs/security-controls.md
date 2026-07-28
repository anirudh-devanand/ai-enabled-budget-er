# Woney fintech security controls

This document maps bank-grade / fintech security expectations to what Woney
**implements in code**, what the **hosting platforms** provide, and what remains
**organizational process** (cannot be “finished” by a middleware alone).

Last updated: 2026-07-28

---

## Requirement → status

| Requirement | Status | How Woney meets it |
|-------------|--------|--------------------|
| **Encrypt data in transit (TLS 1.2+)** | Met (platform) | Render + Vercel terminate TLS. API adds HSTS in production. Web sets HSTS via Next headers. |
| **Encrypt sensitive data at rest (AES-class)** | Strong for secrets + descriptors | Fernet for bank access tokens, TOTP secrets, `Transaction.raw_description`, `Account.notes`. Passwords = argon2id. Amounts/balances stay queryable Numerics (host disk encryption + RBAC). `masked_number` ≤ last-4. |
| **MFA** | Required for bank ingress | TOTP + recovery on login/OAuth. **Required** before Plaid / CSV / demo connect, `sync-mine`, and per-connection sync (`403 mfa_required`). Enroll UI: Account → Security. |
| **RBAC / least privilege** | Met for bank mutations | Household `owner` / `member`; owner-only invites; **owner-only** bank link/sync/import and account patch; ops routes require `WONEY_OPS_TOKEN` (fail closed). |
| **API security via tokenization / OAuth (not screen scraping)** | Met | **Plaid Link** (OAuth-style token exchange). CSV/demo for non-Plaid. Flinks optional legacy. |
| **JWT / session hygiene** | Met | Short-lived access JWT + rotating hashed refresh sessions. Web: refresh in **HttpOnly** cookie (`SameSite=None; Secure` in production); JSON omits refresh when `X-Woney-Session: cookie`. Mobile: SecureStore + JSON body. |
| **Threat monitoring / vuln / pen test** | SIEM-lite + process | `security_events` + structured `woney.security` JSON logs. Not a full IDS — use Render log drains, Dependabot, schedule external pen tests. |
| **SOC 2 / ISO 27001** | Process | Controls below support evidence; certification needs policies, vendor DPAs, audits. **Do not claim SOC 2 in product copy until audited.** |
| **PCI DSS** | Mostly N/A | We do **not** store full PANs; Plaid holds credentials; only last-4 masks in DB. |
| **GDPR / CCPA / GLBA privacy** | Partial + process | Account deletion cascade; assistant privacy gate; DSAR via deletion; vendor DPAs needed; privacy policy / retention = legal. |
| **BaaS / sponsor bank addenda** | N/A unless you become BaaS | Woney is a PFM using Plaid, not a sponsor bank. |

---

## Core technical controls (code)

### Data protection
- Transit: HTTPS at edge; production `Strict-Transport-Security` on API + web.
- At rest (app): `encrypt_secret` for aggregator tokens / MFA; `encrypt_field` (`enc:v1:`) for descriptors and notes (`backend/app/core/security.py`).
- Passwords: argon2id.
- Money columns: plaintext `Numeric` for SQL aggregates; mitigated by Postgres disk encryption + household RBAC + MFA gate.
- Assistant + enrichment LLM: privacy redaction / allowlists (`docs/assistant-privacy.md`).

### Access management
- MFA: `/v1/auth/mfa/*`; Account → Security enroll/activate/recovery.
- Bank gate: all connect/sync/import paths require `mfa_enabled` (detail `mfa_required`).
- Owner-only bank mutations (members may read).
- Auth rate limits (`backend/app/core/rate_limit.py`).
- Ops: `X-Ops-Token` fail-closed.

### Session / cookies (web)
- Cookie: `woney_refresh` — HttpOnly; production `Secure; SameSite=None`.
- Header `X-Woney-Session: cookie` → empty `refresh_token` in JSON.
- Web storage: access in `sessionStorage`; `woney.session=1` flag only — **never** refresh in localStorage.
- CORS: `allow_credentials=True` with explicit origins.

### Audit (SIEM-lite)
- Table `security_events` (migration `0011`): `event_type`, `user_id`, `ip`, `user_agent`, `meta` (secrets stripped).
- Events include: login success/fail, MFA verify, OAuth, logout/logout-all, refresh fail, password-reset request, MFA gate denial, Plaid/CSV/demo connect, sync_mine, sync_failed.
- Each event also emits a JSON log line on logger `woney.security` for Render → Datadog/Sentry drains.

### API security
- Plaid Link tokens (not scraping); CSP allows `cdn.plaid.com`.
- Security headers on API + web.

### Privacy / AI
- `WONEY_LLM_PRIVACY_MODE=strict` (default).
- `WONEY_LLM_ENABLED=false` forces offline tools-only.

---

## What we never store

- Full card / account PANs (last-4 only)
- Bank passwords / Plaid credentials in plaintext (encrypted aggregator tokens only)
- User refresh tokens in browser JS storage (web)

---

## Trust pack (process — you operate)

### Vendor DPAs / agreements checklist
- [ ] Plaid
- [ ] Anthropic (prefer zero-retention where available)
- [ ] Resend
- [ ] Google / Apple / Microsoft OAuth
- [ ] Render
- [ ] Vercel

### Incident response (outline)
1. Revoke sessions: force users via `logout-all` / rotate `WONEY_JWT_SECRET` (invalidates access JWTs after expiry window).
2. Rotate Fernet `WONEY_DATA_ENCRYPTION_KEY` only with a re-encrypt plan (breaking change if done cold).
3. Rotate Plaid / Resend / LLM secrets in Render; redeploy.
4. Review `security_events` + Render logs for the window.
5. Notify affected users if financial PII may have leaked.

### Retention / DSAR
- Account deletion cascades household money data (see account delete flow).
- Export-on-request is a legal/product follow-up; deletion is the current self-serve control.

### Pen test / SOC 2
- Schedule an external pen test before marketing “bank-grade” broadly.
- SOC 2 Type I when revenue / enterprise deals justify — engineering controls here are evidence, not a certificate.

### Platform owners

| Control | Owner |
|---------|--------|
| Render Postgres encryption / backups | Render |
| Vercel TLS + deploy isolation | Vercel |
| Secret rotation | You / Render dashboard |
| Vendor DPAs | You |
| Penetration test + vuln SLA | You |
| Privacy policy, ToS | You / counsel |

---

## Gaps still open (honest)

1. **Access JWT in `sessionStorage`** — XSS can still steal the short-lived access token (15 min). HttpOnly refresh greatly reduces session theft impact.
2. **Balances / amounts** — not field-encrypted (by design for SQL metrics).
3. **SIEM-lite ≠ continuous IDS** — no anomaly alerting product.
4. **SOC 2 / ISO / GLBA written program** — process, not middleware.
5. **No impregnability claim** — banks themselves are not hack-proof; layered controls + process reduce risk.

---

## Quick verification

```bash
curl -sI https://YOUR-API.onrender.com/healthz
curl -s https://YOUR-API.onrender.com/healthz | jq '{llm_privacy_strict, llm_enabled, plaid_configured}'
curl -sI https://woneyai.vercel.app | grep -iE 'strict-transport|x-frame|content-security'
```

Browser DevTools after login:
1. Cookies on API host: `woney_refresh` HttpOnly / Secure / SameSite=None.
2. Local Storage on web: `woney.session=1` only — no `woney.refresh`.
3. Session Storage: `woney.access` present.
4. Account → Security → Enable MFA, then Connect unblocks.

Recommended Render env:

```
WONEY_ENV=production
WONEY_JWT_SECRET=...
WONEY_DATA_ENCRYPTION_KEY=...
WONEY_OPS_TOKEN=...
WONEY_CORS_ORIGINS=https://woneyai.vercel.app
WONEY_LLM_PRIVACY_MODE=strict
WONEY_PLAID_* / WONEY_RESEND_* / OAuth as needed
```

Apply migration `0012_encrypted_text_fields` on deploy (Text columns for encrypted descriptors/notes).
