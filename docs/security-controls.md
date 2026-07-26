# Woney fintech security controls

This document maps bank-grade / fintech security expectations to what Woney
**implements in code**, what the **hosting platforms** provide, and what remains
**organizational process** (cannot be “finished” by a middleware alone).

Last updated: 2026-07-25

---

## Requirement → status

| Requirement | Status | How Woney meets it |
|-------------|--------|--------------------|
| **Encrypt data in transit (TLS 1.2+)** | Met (platform) | Render + Vercel terminate TLS. API adds HSTS in production. Web sets HSTS via Next headers. |
| **Encrypt sensitive data at rest (AES-class)** | Partial → strong for secrets | Fernet (AES-128-CBC + HMAC) for bank access tokens + TOTP secrets. Passwords = argon2id. Postgres disk encryption = Render managed. Transaction/PII columns not field-encrypted (host + access control). |
| **MFA** | Implemented (optional) | TOTP + recovery codes on password and OAuth login; also for account deletion when MFA on. Not yet *forced* for all users / bank link. |
| **RBAC / least privilege** | Partial | Household `owner` / `member`; owner-only invites; ops routes require `WONEY_OPS_TOKEN` (fail closed). Members can still sync banks — tighten later. |
| **API security via tokenization / OAuth (not screen scraping)** | Met | **Plaid Link** (OAuth-style token exchange). CSV/demo for non-Plaid. Flinks optional legacy. |
| **JWT / session hygiene** | Met | Short-lived access JWT + rotating hashed refresh sessions; logout / logout-all. |
| **Threat monitoring / vuln / pen test** | Process | No in-app SIEM. Use Render logs, `npm audit` / Dependabot, schedule external pen tests. |
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
- Assistant + enrichment LLM: privacy redaction / allowlists before Anthropic (`docs/assistant-privacy.md`).

### Access management
- MFA: `/v1/auth/mfa/*`.
- Auth rate limits: login, register, MFA verify, refresh, password reset, OAuth callback (`backend/app/core/rate_limit.py`).
- Ops: `X-Ops-Token` required whenever ops routes are hit.

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

1. **Web refresh tokens in `localStorage`** — XSS risk. Next hardening: HttpOnly Secure cookie for refresh.
2. **MFA not mandatory** for bank linking / all accounts.
3. **No continuous IDS/SIEM** in product — rely on host logs + external monitoring.
4. **SOC 2 / ISO / GLBA written program** — not a code feature.
5. **Field-level encryption** of all financial rows — not done; mitigate with host encryption + least privilege + deletion.
6. **Member vs owner** bank-mutation permissions — still coarse.

---

## Quick verification

```bash
# API headers + privacy flags
curl -sI https://YOUR-API.onrender.com/healthz
curl -s https://YOUR-API.onrender.com/healthz | jq '{llm_privacy_strict, llm_enabled, plaid_configured}'

# Web headers
curl -sI https://woneyai.vercel.app | grep -iE 'strict-transport|x-frame|content-security'
```

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
