"""Mandatory privacy filters before any data leaves the API host for an LLM."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any

from app.core.config import get_settings
from app.core.llm import LlmMessage
from app.core.money import quantize_money

# Stable replacement tokens
_REDACTED_ACCOUNT = "[REDACTED_ACCOUNT]"
_REDACTED_SIN = "[REDACTED_SIN]"
_REDACTED_EMAIL = "[REDACTED_EMAIL]"
_REDACTED_SECRET = "[REDACTED_SECRET]"
_REDACTED_TOKEN = "[REDACTED_TOKEN]"

# Long digit runs that look like PANs / account numbers (ignore shorter refs).
_RE_PAN = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}\d(?!\d)")
# Canadian SIN: 123 456 789 or 123456789
_RE_SIN = re.compile(r"(?<!\d)\d{3}[ -]?\d{3}[ -]?\d{3}(?!\d)")
_RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_RE_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_RE_API_KEY = re.compile(r"\b(?:sk|re|pk)[-_][A-Za-z0-9]{16,}\b")
_RE_PLAID_ACCESS = re.compile(r"\baccess-(?:sandbox|development|production)-[A-Za-z0-9-]+\b", re.I)
_RE_PASSWORD_LINE = re.compile(
    r"(?i)\b(password|passwd|secret|api[_-]?key)\s*[:=]\s*\S+"
)

_HISTORY_CAP = 12  # user+assistant turns each side of the pair → last 12 of each role stream


def privacy_strict() -> bool:
    mode = (get_settings().llm_privacy_mode or "strict").strip().lower()
    return mode != "off"


def redact_user_text(text: str) -> str:
    """Scrub secrets / account-like digit runs from user chat before persist + LLM."""
    if not text:
        return text
    if not privacy_strict():
        return text
    out = text
    out = _RE_JWT.sub(_REDACTED_TOKEN, out)
    out = _RE_PLAID_ACCESS.sub(_REDACTED_TOKEN, out)
    out = _RE_API_KEY.sub(_REDACTED_SECRET, out)
    out = _RE_PASSWORD_LINE.sub(r"\1: " + _REDACTED_SECRET, out)
    out = _RE_EMAIL.sub(_REDACTED_EMAIL, out)
    out = _RE_SIN.sub(_REDACTED_SIN, out)
    out = _RE_PAN.sub(_REDACTED_ACCOUNT, out)
    return out


def _account_label(index: int, acc_type: str | None, name: str | None) -> str:
    t = (acc_type or "").lower()
    n = (name or "").lower()
    if "chequ" in t or "check" in t or "chequ" in n or "check" in n:
        return "Chequing"
    if "sav" in t or "sav" in n:
        return "Savings"
    if "credit" in t or "visa" in n or "card" in t:
        return "Credit card"
    letter = chr(ord("A") + (index % 26))
    return f"Account {letter}"


def sanitize_tool_payload(name: str, data: Any) -> Any:
    """Allowlist tool JSON for the LLM — drop UUIDs, masks, tokens."""
    if name == "get_net_worth":
        if not isinstance(data, dict):
            return {"total": "0", "currency": "CAD", "accounts": []}
        accounts_in = data.get("accounts") or []
        accounts_out = []
        for i, acc in enumerate(accounts_in):
            if not isinstance(acc, dict):
                continue
            accounts_out.append(
                {
                    "display_name": _account_label(
                        i, str(acc.get("type") or ""), str(acc.get("name") or "")
                    ),
                    "type": acc.get("type") or "account",
                    "balance": str(quantize_money(Decimal(str(acc.get("balance") or 0)))),
                }
            )
        return {
            "currency": data.get("currency") or "CAD",
            "total": str(quantize_money(Decimal(str(data.get("total") or 0)))),
            "accounts": accounts_out,
        }

    if name == "get_spending_summary":
        rows = data if isinstance(data, list) else []
        return [
            {
                "name": str(r.get("name") or "Other"),
                "amount": str(quantize_money(Decimal(str(r.get("amount") or 0)))),
            }
            for r in rows
            if isinstance(r, dict)
        ]

    if name == "get_budget_status":
        if not isinstance(data, dict):
            return {"categories": []}
        cats = data.get("categories") or []
        return {
            "categories": [
                {
                    "name": str(c.get("name") or "Category"),
                    "target": str(quantize_money(Decimal(str(c.get("target") or 0)))),
                    "spent": str(
                        quantize_money(
                            Decimal(str(c.get("spent", c.get("actual") or 0)))
                        )
                    ),
                    "remaining": str(
                        quantize_money(Decimal(str(c.get("remaining") or 0)))
                    ),
                }
                for c in cats
                if isinstance(c, dict)
            ]
        }

    if name == "get_goal_progress":
        rows = data if isinstance(data, list) else []
        out = []
        for g in rows:
            if not isinstance(g, dict):
                continue
            summary = g.get("plan_summary")
            if isinstance(summary, str):
                summary = redact_user_text(summary)
            out.append(
                {
                    "name": str(g.get("name") or "Goal"),
                    "type": str(g.get("type") or "save"),
                    "target": str(quantize_money(Decimal(str(g.get("target") or 0)))),
                    "current": str(quantize_money(Decimal(str(g.get("current") or 0)))),
                    "plan_summary": summary,
                }
            )
        return out

    if name == "simulate_scenario":
        if not isinstance(data, dict):
            return {"current_surplus": "0", "scenario_surplus": "0"}
        return {
            "current_surplus": str(
                quantize_money(Decimal(str(data.get("current_surplus") or 0)))
            ),
            "scenario_surplus": str(
                quantize_money(Decimal(str(data.get("scenario_surplus") or 0)))
            ),
        }

    # Unknown tools: refuse to forward raw payloads
    return {"error": "tool_result_redacted"}


def sanitize_tool_result_json(name: str, raw_json: str) -> str:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        return json.dumps({"error": "invalid_tool_payload"})
    safe = sanitize_tool_payload(name, data)
    return json.dumps(safe, default=str)


def _looks_like_uuid(value: str) -> bool:
    return bool(
        re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            value,
        )
    )


def _scrub_string(value: str) -> str:
    text = redact_user_text(value)
    # Defense in depth: never ship bare UUIDs in LLM strings
    if privacy_strict():
        text = re.sub(
            r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b",
            "[REDACTED_ID]",
            text,
        )
    return text


def sanitize_for_llm(messages: list[LlmMessage]) -> list[LlmMessage]:
    """Last-line filter on every outbound LLM message. Fail closed on errors."""
    try:
        out: list[LlmMessage] = []
        for m in messages:
            content = m.content if m.content is not None else ""
            if m.role == "tool":
                # Tool content should already be allowlisted; still scrub text patterns
                content = _scrub_string(content)
            elif m.role in ("user", "assistant", "system"):
                content = _scrub_string(content)
            else:
                content = _scrub_string(content)
            out.append(
                LlmMessage(
                    role=m.role,
                    content=content,
                    tool_call_id=m.tool_call_id,
                    name=m.name,
                )
            )
        return out
    except Exception as exc:
        raise RuntimeError("sanitize_for_llm failed") from exc


def cap_history(messages: list[LlmMessage], max_turns: int = _HISTORY_CAP) -> list[LlmMessage]:
    """Keep system prompt + last N user/assistant messages (no tool rows from DB)."""
    system = [m for m in messages if m.role == "system"]
    rest = [m for m in messages if m.role in ("user", "assistant")]
    if len(rest) > max_turns:
        rest = rest[-max_turns:]
    return [*system, *rest]


PRIVACY_SYSTEM_ADDENDUM = (
    " Privacy: tool and chat data are privacy-filtered. Never ask for full bank "
    "account numbers, SIN, passwords, or API keys. Use aggregates and display names only."
)
