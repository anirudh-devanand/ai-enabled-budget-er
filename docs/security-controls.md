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
| **Encrypt sensitive data at rest (AES-class)** | Partial → strong for secrets | Fernet (AES-128-CBC + HMAC) for bank access tokens + TOTP secrets. Passwords = argon2id. Postgres disk encryption = Render managed. Transaction/balance columns not field-encrypted (host + access control). `masked_number` capped at last-4 digits. |
| **MFA** | Met for live bank link | TOTP + recovery codes on password and OAuth login; **required** before Plaid Link / live Flinks connect. CSV import + demo seed stay open without MFA (Neo path). Account deletion still challenges when MFA on. |
| **RBAC / least privilege** | Partial | Household `owner` / `member`; owner-only invites; ops routes require `WONEY_OPS_TOKEN` (fail closed). Members can still sync banks — tighten later. |
| **API security via tokenization / OAuth (not screen scraping)** | Met | **Plaid Link** (OAuth-style token exchange). CSV/demo for non-Plaid. Flinks optional legacy. |
| **JWT / session hygiene** | Met | Short-lived access JWT + rotating hashed refresh sessions; logout / logout-all. Web: refresh in **HttpOnly** cookie (`SameSite=None; Secure` in production for Vercel↔Render). Mobile: refresh in SecureStore + JSON body. |
| **Threat monitoring / vuln / pen test** | Partial (SIEM-lite) | In-app `security_events` table records login/MFA/OAuth/logout/Plaid/sync (no secrets). Not a full IDS/SIEM — still use Render logs, `npm audit` / Dependabot, schedule external pen tests. |
| **SOC 2 / ISO 27001** | Process | Controls below support evidence; certification needs policies, vendors DPAs, audits. |
| **PCI DSS** | Mostly N/A | We do **not** store full PANs; Plaid holds credentials; only last-4 masks in DB. |
| **GDPR / CCPA / GLBA privacy** | Partial + process | Account deletion cascade; assistant privacy gate; Resend/Anthropic/Plaid DPAs needed; privacy policy / retention schedule = legal. |
| **BaaS / sponsor bank addenda** | N/A unless you become BaaS | Woney is a PFM using Plaid, not a sponsor bank. If you later partner under BaaS, contractual controls apply on top. |

---

## Core technical controls (code)

### Data protection
- Transit: HTTPS at edge; production `Strict-Transport-Security` on API + web.
- At rest (app): `encrypt_secret` / Fernet for `login_id_encrypted`, MFA secrets (`backend/app/core/security.py`).
- Passwords: argon2id.
- Account masks: `sanitize_masked_number` stores at most 4 digits; balances rely on Postgres disk encryption + access control (not field-encrypted).
- Assistant + enrichment LLM: privacy redaction / allowlists before Anthropic (`docs/assistant-privacy.md`).

### Access management
- MFA: `/v1/auth/mfa/*`; enroll/activate UI on Account → Security.
- Live bank gate: Plaid link-token / Plaid exchange / non-demo Flinks create require `mfa_enabled`.
- Auth rate limits: login, register, MFA verify, refresh, password reset, OAuth callback (`backend/app/core/rate_limit.py`).
- Ops: `X-Ops-Token` required whenever ops routes are hit.

### Session / cookies (web)
- Cookie name: `woney_refresh`.
- Production (cross-site Vercel → Render): `HttpOnly; Secure; SameSite=None; Path=/; Max-Age=refresh lifetime`.
- Development (localhost): `HttpOnly; SameSite=Lax` (Secure when HTTPS).
- `POST /v1/auth/refresh` and `/logout` accept refresh from **cookie or JSON body** (mobile keeps body).
- Web `BrowserTokenStorage`: access JWT in `sessionStorage` only; session flag `woney.session=1` in `localStorage`; refresh never persisted in JS storage.
- CORS: `allow_credentials=True` with explicit origins (required for cross-site cookies).

### Audit (SIEM-lite)
- Table `security_events` (`0011_security_events` migration): `event_type`, `user_id`, `ip`, `user_agent`, `meta` JSON (secrets stripped).
- Recorded: failed/successful login, MFA verify success/fail, OAuth login, logout, Plaid link-token, Plaid connection created, sync_mine.

### API security
- Plaid Link tokens (not scraping).
- CORS allow-list + known cutover hosts.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, API CSP `default-src 'none'`.

### Privacy / AI
- `WONEY_LLM_PRIVACY_MODE=strict` (default).
- `WONEY_LLM_ENABLED=false` forces offline tools-only (no public AI).

---

## Platform controls (you operate)

| Control | Owner |
|---------|--------|
| Render Postgres encryption / backups | Render |
| Vercel TLS + deploy isolation | Vercel |
| Secret rotation (`WONEY_JWT_SECRET`, Fernet key, Plaid, Resend, LLM) | You / Render dashboard |
| Anthropic / Plaid / Resend / Google DPAs | You (vendor contracts) |
| Penetration test + vuln SLA | You (schedule annually / pre-launch) |
| Incident response + access reviews | You |
| Privacy policy, ToS, retention, DSAR export | You / counsel |

---

## Gaps still open (honest)

1. **Access JWT in `sessionStorage`** — XSS can still steal the short-lived access token. HttpOnly refresh reduces refresh-token XSS theft; it does **not** make the app impregnable.
2. **Balances / transaction rows** — not field-encrypted; rely on host disk encryption + DB access control.
3. **SIEM-lite ≠ continuous IDS** — `security_events` is an append-only audit log, not alerting / anomaly detection.
4. **SOC 2 / ISO / GLBA written program** — not a code feature.
5. **Member vs owner** bank-mutation permissions — still coarse.
6. **MFA not forced for every account** — only for live bank linking; CSV/demo remain open by design.

---

## Quick verification

```bash
# API headers + privacy flags
curl -sI https://YOUR-API.onrender.com/healthz
curl -s https://YOUR-API.onrender.com/healthz | jq '{llm_privacy_strict, llm_enabled, plaid_configured}'

# Web headers
curl -sI https://woneyai.vercel.app | grep -iE 'strict-transport|x-frame|content-security'
```

Browser DevTools after login:
1. **Application → Cookies** on the API host (`*.onrender.com`): `woney_refresh` should be HttpOnly, Secure, SameSite=None.
2. **Application → Local Storage** on the web host: `woney.session=1` only — **no** `woney.refresh`.
3. **Session Storage**: `woney.access` present; refresh absent.
4. Account → Security: Enable MFA, then Connect → Plaid CTA unblocks.

Recommended Render env (security-relevant):

```
WONEY_ENV=production
WONEY_JWT_SECRET=...
WONEY_DATA_ENCRYPTION_KEY=...   # Fernet
WONEY_OPS_TOKEN=...
WONEY_CORS_ORIGINS=https://woneyai.vercel.app
WONEY_LLM_PRIVACY_MODE=strict
WONEY_LLM_ENABLED=true   # or false for offline-only AI
WONEY_PLAID_* / WONEY_RESEND_* / OAuth as needed
```
