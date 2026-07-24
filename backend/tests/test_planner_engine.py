from datetime import date
from decimal import Decimal

from app.core.money import format_money, quantize_money
from app.planner.engine import project_goal, recommend_cuts, simulate_scenario


def test_quantize_and_format_money():
    assert quantize_money(Decimal("416.666666666666666666666667")) == Decimal("416.67")
    assert format_money(Decimal("416.666666666666666666666667")) == "$416.67"
    assert format_money(Decimal("10555.57666666666666666666667")) == "$10,555.58"
    assert format_money(Decimal("-12.5"), currency="CAD") == "-$12.50 CAD"


def test_project_goal_on_track():
    p = project_goal(
        target_amount=Decimal("1200"),
        current_amount=Decimal("0"),
        target_date=date(2026, 12, 20),
        monthly_surplus=Decimal("200"),
        today=date(2026, 6, 20),
    )
    assert p.months_remaining == 6
    assert p.monthly_needed == Decimal("200.00")
    assert p.on_track is True
    assert p.gap == Decimal("0.00")


def test_project_goal_shortfall():
    p = project_goal(
        target_amount=Decimal("1200"),
        current_amount=Decimal("0"),
        target_date=date(2026, 12, 20),
        monthly_surplus=Decimal("50"),
        today=date(2026, 6, 20),
    )
    assert p.on_track is False
    assert p.gap == Decimal("150.00")


def test_project_goal_no_target_rounds_monthly_needed():
    """Division without a target date used to leave long Decimal trails in UI text."""
    p = project_goal(
        target_amount=Decimal("5000"),
        current_amount=Decimal("0"),
        target_date=None,
        monthly_surplus=Decimal("0"),
        today=date(2026, 6, 20),
    )
    assert p.months_remaining == 12
    assert p.monthly_needed == Decimal("416.67")
    assert "." in str(p.monthly_needed) and len(str(p.monthly_needed).split(".")[1]) <= 2


def test_simulate_scenario():
    assert simulate_scenario(Decimal("300"), income_delta=Decimal("100"), expense_delta=Decimal("50")) == Decimal(
        "350.00"
    )


def test_recommend_cuts_skips_protected():
    cuts = recommend_cuts(
        {
            "housing": Decimal("2000"),
            "dining": Decimal("400"),
            "shopping": Decimal("300"),
            "utilities": Decimal("150"),
        },
        Decimal("100"),
    )
    slugs = [c[0] for c in cuts]
    assert "housing" not in slugs
    assert "utilities" not in slugs
    assert sum(c[1] for c in cuts) >= Decimal("80")
    assert all("/month" in c[2] and "66666" not in c[2] for c in cuts)
    assert all(format_money(c[1]) in c[2] for c in cuts)
