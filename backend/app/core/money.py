"""Shared money quantize + display helpers (always 2 decimal places)."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

MONEY_QUANT = Decimal("0.01")


def quantize_money(amount: Any) -> Decimal:
    """Round to nearest cent (half up)."""
    if isinstance(amount, Decimal):
        value = amount
    else:
        value = Decimal(str(amount))
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def format_money(amount: Any, currency: str | None = None) -> str:
    """Format a money amount for user-facing text, e.g. `$416.67` or `$416.67 CAD`."""
    try:
        value = quantize_money(amount)
    except (InvalidOperation, ValueError, TypeError):
        return str(amount)
    sign = "-" if value < 0 else ""
    body = f"{sign}${abs(value):,.2f}"
    if currency:
        return f"{body} {currency}"
    return body
