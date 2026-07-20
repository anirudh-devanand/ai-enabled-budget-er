from app.enrichment.normalize import normalize_descriptor
from app.enrichment.rules import match_global_rule


def _match(raw: str):
    return match_global_rule(normalize_descriptor(raw))


def test_canadian_merchants_resolve():
    cases = {
        "TIM HORTONS #1234 TORONTO": ("Tim Hortons", "dining"),
        "POS DEBIT LOBLAWS 0233": ("Loblaws", "groceries"),
        "SHOPPERS DRUG MART #0771": ("Shoppers Drug Mart", "shopping"),
        "PRESTO FARE TORONTO 887": ("PRESTO", "transport"),
        "NETFLIX.COM 866-579": ("Netflix", "subscriptions"),
        "AMZN Mktp CA*2H4LL0": ("Amazon", "shopping"),
        "SKIPTHEDISHES VANCOUVER": ("SkipTheDishes", "dining"),
    }
    for raw, (merchant, category) in cases.items():
        rule = _match(raw)
        assert rule is not None, raw
        assert rule.merchant == merchant
        assert rule.category_slug == category


def test_uber_eats_wins_over_uber():
    rule = _match("UBER *EATS TORONTO")
    assert rule is not None
    assert rule.merchant == "Uber Eats"
    assert rule.category_slug == "dining"

    rule = _match("UBER TRIP 8A3KX")
    assert rule is not None
    assert rule.merchant == "Uber"
    assert rule.category_slug == "transport"


def test_bank_side_patterns_have_no_merchant():
    payroll = _match("PAYROLL DEPOSIT ACME LTD")
    assert payroll is not None
    assert payroll.merchant is None
    assert payroll.category_slug == "income"

    etransfer = _match("INTERAC E-TRANSFER SENT")
    assert etransfer is not None
    assert etransfer.category_slug == "transfers"

    fee = _match("MONTHLY ACCOUNT FEE")
    assert fee is not None
    assert fee.category_slug == "fees"


def test_unknown_descriptor_returns_none():
    assert _match("ZZQ HOLDINGS 8837261") is None
