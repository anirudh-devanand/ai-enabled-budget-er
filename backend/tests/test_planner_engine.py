from datetime import date
from decimal import Decimal

from app.planner.engine import project_goal, recommend_cuts, simulate_scenario


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
    assert p.gap == Decimal("0")


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


def test_simulate_scenario():
    assert simulate_scenario(Decimal("300"), income_delta=Decimal("100"), expense_delta=Decimal("50")) == Decimal("350")


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
