from decimal import Decimal

from app.connections.flinks import _parse_snapshot


def _flinks_payload() -> dict:
    return {
        "Institution": "FlinksCapital",
        "Accounts": [
            {
                "Id": "acc-guid-1",
                "AccountNumber": "1000004523",
                "Title": "Chequing",
                "Category": "Operations",
                "Currency": "CAD",
                "Balance": {"Available": 1000.0, "Current": 1023.11},
                "Transactions": [
                    {
                        "Id": "txn-1",
                        "Date": "2026-07-15T00:00:00",
                        "Description": "NEO FINANCIAL PURCHASE 8837261",
                        "Debit": 42.5,
                        "Credit": None,
                        "Balance": 1023.11,
                    },
                    {
                        "Id": "txn-2",
                        "Date": "2026-07-16",
                        "Description": "PAYROLL DEPOSIT",
                        "Debit": None,
                        "Credit": 2150.0,
                        "Balance": None,
                    },
                    # Malformed rows are skipped, not fatal.
                    {"Id": None, "Date": "2026-07-17", "Debit": 1.0},
                    {"Id": "txn-4", "Date": "2026-07-17", "Debit": None, "Credit": None},
                ],
            }
        ],
    }


def test_parse_snapshot_maps_debits_credits_and_masks_account():
    snapshot = _parse_snapshot("req-1", _flinks_payload())

    assert snapshot.institution_name == "FlinksCapital"
    assert len(snapshot.accounts) == 1
    account = snapshot.accounts[0]
    assert account.name == "Chequing"
    assert account.balance == Decimal("1023.11")
    assert account.masked_number == "4523"

    assert len(account.transactions) == 2
    debit, credit = account.transactions
    assert debit.amount == Decimal("-42.5")
    assert debit.date.isoformat() == "2026-07-15"
    assert credit.amount == Decimal("2150")


def test_parse_snapshot_handles_empty_payload():
    snapshot = _parse_snapshot("req-2", {})
    assert snapshot.accounts == []
