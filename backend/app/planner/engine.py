"""Deterministic projection math. The LLM never does arithmetic."""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.core.money import format_money, quantize_money


def _months_between(start: date, end: date) -> int:
    return max(1, (end.year - start.year) * 12 + (end.month - start.month))


def add_months(d: date, months: int) -> date:
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last))


@dataclass
class Projection:
    months_remaining: int
    monthly_needed: Decimal
    projected_completion: date
    on_track: bool
    gap: Decimal  # positive = shortfall vs current surplus


def project_goal(
    target_amount: Decimal,
    current_amount: Decimal,
    target_date: date | None,
    monthly_surplus: Decimal,
    today: date | None = None,
) -> Projection:
    today = today or date.today()
    remaining = max(Decimal("0"), target_amount - current_amount)
    if remaining == 0:
        return Projection(0, Decimal("0.00"), today, True, Decimal("0.00"))

    if target_date and target_date > today:
        months = _months_between(today, target_date)
        monthly_needed = quantize_money(remaining / Decimal(months))
        projected = target_date
    elif monthly_surplus > 0:
        months = int((remaining / monthly_surplus).to_integral_value(rounding=ROUND_HALF_UP))
        months = max(1, months)
        monthly_needed = quantize_money(monthly_surplus)
        projected = add_months(today, months)
    else:
        months = 12
        monthly_needed = quantize_money(remaining / Decimal(months))
        projected = add_months(today, months)

    on_track = monthly_surplus >= monthly_needed
    gap = quantize_money(max(Decimal("0"), monthly_needed - monthly_surplus))
    return Projection(months, monthly_needed, projected, on_track, gap)


def simulate_scenario(
    monthly_surplus: Decimal,
    income_delta: Decimal = Decimal("0"),
    expense_delta: Decimal = Decimal("0"),
) -> Decimal:
    """New monthly surplus after income/expense changes. expense_delta > 0 means more spending."""
    return quantize_money(monthly_surplus + income_delta - expense_delta)


def recommend_cuts(
    category_spend: dict[str, Decimal],
    gap: Decimal,
    protected: set[str] | None = None,
) -> list[tuple[str, Decimal, str]]:
    """Suggest cuts from the largest discretionary categories until gap is covered."""
    protected = protected or {"housing", "utilities", "income", "transfers", "fees"}
    ranked = sorted(
        ((slug, amt) for slug, amt in category_spend.items() if slug not in protected and amt > 0),
        key=lambda x: x[1],
        reverse=True,
    )
    remaining = quantize_money(gap)
    cuts: list[tuple[str, Decimal, str]] = []
    for slug, amt in ranked:
        if remaining <= 0:
            break
        # Cap cut at 20% of that category's spend.
        cut = min(remaining, quantize_money(amt * Decimal("0.20")))
        if cut <= 0:
            continue
        cuts.append((slug, cut, f"Reduce {slug} by about {format_money(cut)}/month"))
        remaining -= cut
    return cuts
