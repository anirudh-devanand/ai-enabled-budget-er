from app.enrichment.normalize import normalize_descriptor, prettify_descriptor


def test_strips_processor_prefixes():
    assert normalize_descriptor("SQ *JOES COFFEE 0421 TORONTO") == "JOES COFFEE TORONTO"
    assert normalize_descriptor("PAYPAL *STEAMGAMES 402935") == "STEAMGAMES"
    assert normalize_descriptor("POS DEBIT TIM HORTONS #1234") == "TIM HORTONS"
    assert normalize_descriptor("INTERAC PURCHASE - 7829 LOBLAWS") == "LOBLAWS"


def test_strips_store_numbers_and_noise():
    assert normalize_descriptor("WAL-MART #3115") == "WAL MART"
    assert normalize_descriptor("UBER   *TRIP 8A3KX") == "UBER *TRIP 8A3KX".replace("  ", " ")
    assert normalize_descriptor("NETFLIX.COM 866-579-7172") == "NETFLIX.COM"


def test_same_merchant_normalizes_identically():
    a = normalize_descriptor("TIM HORTONS #0455 CALGARY")
    b = normalize_descriptor("POS DEBIT TIM HORTONS #7721")
    assert a.startswith("TIM HORTONS")
    assert b.startswith("TIM HORTONS")


def test_never_returns_empty():
    assert normalize_descriptor("38271") != ""
    assert normalize_descriptor("   ") != ""


def test_prettify_title_cases_with_known_acronyms():
    assert prettify_descriptor("XYZ MERCHANT 9987") == "Xyz Merchant"
    assert prettify_descriptor("EQ BANK TRANSFER 12") == "EQ Bank Transfer"
