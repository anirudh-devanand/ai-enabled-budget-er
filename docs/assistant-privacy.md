# Assistant privacy

Woney’s assistant may call a public LLM (Anthropic by default). **No string reaches that API unless it passes the privacy gate.**

## What never leaves the API host

- Full bank account / card numbers (not stored; only last-4 masks in DB for UI)
- Last-4 masks (`masked_number`) — stripped from tool JSON before LLM
- Account / category / goal UUIDs
- Plaid access tokens, API keys, JWTs
- User-pasted PANs, SINs, emails, passwords (regex-redacted)

## What the model may see

Allowlisted aggregates only:

| Tool | Fields |
|------|--------|
| Net worth | currency, total, per-account `display_name` / type / balance |
| Spending | category name + amount |
| Budgets | category name, target, spent, remaining |
| Goals | name, type, target, current, plan summary (scrubbed) |
| Scenario | surplus numbers |

## Controls (Render env)

| Variable | Default | Meaning |
|----------|---------|---------|
| `WONEY_LLM_PRIVACY_MODE` | `strict` | Redact + allowlist. Set `off` only for local debugging. |
| `WONEY_LLM_ENABLED` | `true` | Set `false` to force offline tools-only (no public AI). |
| `WONEY_LLM_API_KEY` | unset | Without a key, assistant stays offline. |

`GET /healthz` reports `llm_configured`, `llm_enabled`, `llm_privacy_strict` (booleans only).

## Org controls (outside this repo)

- Prefer Anthropic zero-data-retention / DPA for production traffic
- Keep Render secrets out of logs and chat
- Access to the API host remains the trust boundary

## Code entry points

- `backend/app/assistant/privacy.py` — redact + sanitize
- `backend/app/assistant/tools.py` — LLM-safe DTOs
- `backend/app/assistant/service.py` — mandatory gate before `llm.complete`
