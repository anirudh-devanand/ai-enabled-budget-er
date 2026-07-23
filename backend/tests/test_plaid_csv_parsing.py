from datetime import date
from decimal import Decimal

from app.connections.csv_import import parse_bank_csv
from app.connections.plaid import _parse_plaid_snapshot


def test_parse_plaid_negates_outflows():
    snapshot = _parse_plaid_snapshot(
        accounts=[
            {
                "account_id": "acc1",
                "name": "Chequing",
                "type": "depository",
                "subtype": "checking",
                "mask": "4821",
                "balances": {"current": 1000.5, "iso_currency_code": "CAD"},
            }
        ],
        transactions=[
            {
                "account_id": "acc1",
                "transaction_id": "txn1",
                "date": "2026-07-01",
                "name": "TIM HORTONS",
                "amount": 5.25,  # Plaid outflow
                "iso_currency_code": "CAD",
            },
            {
                "account_id": "acc1",
                "transaction_id": "txn2",
                "date": "2026-07-02",
                "merchant_name": "Payroll",
                "amount": -2100.0,  # Plaid inflow
                "iso_currency_code": "CAD",
            },
        ],
        institution_name="TD Canada Trust",
        request_id="req",
    )
    assert snapshot.institution_name == "TD Canada Trust"
    assert len(snapshot.accounts) == 1
    acc = snapshot.accounts[0]
    assert acc.type == "chequing"
    assert acc.balance == Decimal("1000.5")
    assert acc.masked_number == "4821"
    by_id = {t.external_id: t for t in acc.transactions}
    assert by_id["txn1"].amount == Decimal("-5.25")
    assert by_id["txn2"].amount == Decimal("2100.0")


def test_parse_csv_amount_column():
    csv = """Date,Description,Amount
2026-07-01,NEO FINANCIAL PURCHASE,-42.50
2026-07-02,PAYROLL DEPOSIT,2150.00
"""
    snapshot = parse_bank_csv(csv, account_name="Neo Everyday", institution_name="Neo Financial")
    assert snapshot.institution_name == "Neo Financial"
    assert len(snapshot.accounts) == 1
    txns = snapshot.accounts[0].transactions
    assert len(txns) == 2
    assert txns[0].date == date(2026, 7, 1)
    assert txns[0].amount == Decimal("-42.50")
    assert txns[1].amount == Decimal("2150.00")


def test_parse_csv_debit_credit_columns():
    csv = """Transaction Date,Details,Debit,Credit
01/07/2026,Coffee,4.75,
02/07/2026,Transfer,,100.00
"""
    snapshot = parse_bank_csv(csv, account_name="Chequing", account_type="chequing")
    amounts = [t.amount for t in snapshot.accounts[0].transactions]
    assert amounts == [Decimal("-4.75"), Decimal("100.00")]
