"""masked_number last-4 constraint + security event sanitization."""

import pytest

from app.auth.security_events import _sanitize_meta
from app.connections.service import assert_masked_number_length, sanitize_masked_number


def test_sanitize_masked_number_keeps_last_four():
    assert sanitize_masked_number("4523") == "4523"
    assert sanitize_masked_number("****4523") == "4523"
    assert sanitize_masked_number("1234567890") == "7890"
    assert sanitize_masked_number(None) is None
    assert sanitize_masked_number("abcd") is None
    assert len(sanitize_masked_number("99999999") or "") <= 4


def test_assert_masked_number_rejects_over_four_digits():
    assert_masked_number_length("4523")
    assert_masked_number_length(None)
    with pytest.raises(ValueError, match="at most 4"):
        assert_masked_number_length("12345")
    with pytest.raises(ValueError, match="at most 4"):
        assert_masked_number_length("****123456")


def test_security_event_meta_strips_secrets():
    clean = _sanitize_meta(
        {
            "provider": "plaid",
            "password": "should-not-appear",
            "refresh_token": "secret",
            "household_id": "abc",
        }
    )
    assert clean is not None
    assert "provider" in clean
    assert "household_id" in clean
    assert "password" not in clean
    assert "refresh_token" not in clean
