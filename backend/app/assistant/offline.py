"""Deterministic natural-language answers when no LLM API key is configured."""

from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any


def _money(amount: Any, currency: str = "CAD") -> str:
    try:
        value = Decimal(str(amount))
    except Exception:
        return str(amount)
    sign = "-" if value < 0 else ""
    return f"{sign}${abs(value):,.2f} {currency}"


def _parse(raw: str) -> Any:
    try:
        return json.loads(raw)
    except Exception:
        return None


def _intent(question: str) -> str:
    q = question.lower().strip()
    # Greetings / meta — don't dump a full overview for "hi" or pushback.
    if re.search(
        r"^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening)|howdy)\b"
        r"|^(thanks|thank you|thx|ty)\b"
        r"|\b(that (isn'?t|is not|wasn'?t)|not what i asked|wrong answer|"
        r"didn'?t ask|you (didn'?t|misunderstood))\b"
        r"|\b(help|what can you (do|answer)|how (do|does) this work)\b",
        q,
    ):
        return "greeting"
    if re.search(r"\b(dining|restaurant|takeout|coffee|food)\b", q):
        return "dining"
    if re.search(r"\b(grocer|grocery|supermarket)\b", q):
        return "groceries"
    if re.search(r"\b(transport|transit|gas|uber|lyft|parking)\b", q):
        return "transport"
    if re.search(r"\b(travel|flight|hotel|airbnb)\b", q):
        return "travel"
    if re.search(r"\b(shop|shopping|amazon|retail)\b", q):
        return "shopping"
    if re.search(r"\b(subscription|netflix|spotify)\b", q):
        return "subscriptions"
    if re.search(r"\b(utilit|bill|hydro|internet|phone)\b", q):
        return "utilities"
    if re.search(r"\b(net ?worth|balance|how much.*(have|worth)|accounts?)\b", q):
        return "net_worth"
    if re.search(r"\b(spend|spending|where.*(money|go)|breakdown|budget)\b", q):
        return "spending"
    return "general"


def _category_match(name: str, intent: str) -> bool:
    n = name.lower()
    mapping = {
        "dining": ("dining", "takeout", "food", "restaurant"),
        "groceries": ("grocer",),
        "transport": ("transport", "transit", "gas"),
        "travel": ("travel", "flight", "hotel"),
        "shopping": ("shop",),
        "subscriptions": ("subscription",),
        "utilities": ("utilit", "bill"),
    }
    needles = mapping.get(intent, ())
    return any(k in n for k in needles)


def format_offline_reply(question: str, spending_json: str, net_json: str) -> str:
    spending = _parse(spending_json) or []
    net = _parse(net_json) or {}
    intent = _intent(question)
    currency = net.get("currency") or "CAD"
    total = net.get("total")
    accounts = net.get("accounts") or []

    lines: list[str] = []

    if intent == "greeting":
        lines.append(
            "Hi — I’m Woney. I can answer from your live account data: net worth, "
            "spending by category (e.g. dining, groceries), budgets, and goals."
        )
        lines.append(
            "Try something like “What’s my net worth?” or “How much did I spend on dining?”"
        )
    elif intent in {
        "dining",
        "groceries",
        "transport",
        "travel",
        "shopping",
        "subscriptions",
        "utilities",
    }:
        matched = [c for c in spending if _category_match(str(c.get("name", "")), intent)]
        label = {
            "dining": "dining & takeout",
            "groceries": "groceries",
            "transport": "transportation",
            "travel": "travel",
            "shopping": "shopping",
            "subscriptions": "subscriptions",
            "utilities": "utilities & bills",
        }[intent]
        if matched:
            amount = sum(Decimal(str(c.get("amount") or 0)) for c in matched)
            names = ", ".join(str(c.get("name")) for c in matched)
            lines.append(
                f"Over the last 30 days you spent {_money(amount, currency)} on {label}"
                + (f" ({names})." if names.lower() != label else ".")
            )
        else:
            lines.append(f"I don’t see any {label} spending in the last 30 days.")
    elif intent == "net_worth":
        lines.append(f"Your net worth is {_money(total, currency)}.")
        if accounts:
            lines.append("Accounts:")
            for a in accounts:
                lines.append(
                    f"· {a.get('name')}: {_money(a.get('balance'), currency)} ({a.get('type')})"
                )
    else:
        # General / spending overview
        lines.append(f"Your net worth is {_money(total, currency)}.")
        if spending:
            top = sorted(spending, key=lambda c: Decimal(str(c.get("amount") or 0)), reverse=True)[
                :5
            ]
            lines.append("Top spending categories (last 30 days):")
            for c in top:
                lines.append(f"· {c.get('name')}: {_money(c.get('amount'), currency)}")
        else:
            lines.append("No categorized spending in the last 30 days yet.")

    lines.append("")
    lines.append("Ask another question anytime — I’ll answer from your live account data.")
    return "\n".join(lines)
