"""Generate a realistic Canadian bank snapshot for demo / QA seeding."""

from __future__ import annotations

import hashlib
from datetime import date, timedelta
from decimal import Decimal
from itertools import cycle

from app.connections.provider import ProviderAccount, ProviderSnapshot, ProviderTransaction

# (raw_description, amount as outflow negative / inflow positive, typical account)
# Descriptions match GLOBAL_RULES so enrichment categorizes cleanly.
_SPEND_TEMPLATES: list[tuple[str, str, str]] = [
    # groceries
    ("LOBLAWS #2341 TORONTO ON", "-87.45", "chequing"),
    ("NO FRILLS 1234 MISSISSAUGA ON", "-62.10", "chequing"),
    ("COSTCO WHOLESALE W123 TORONTO", "-214.88", "credit"),
    ("METRO 456 OAKVILLE ON", "-54.22", "chequing"),
    ("SOBEYS #8891 BURLINGTON ON", "-48.90", "chequing"),
    ("FRESHCO 221 BRAMPTON ON", "-39.15", "chequing"),
    ("INSTACART *LOBLAWS", "-91.40", "credit"),
    # dining
    ("TIM HORTONS #2847", "-6.45", "chequing"),
    ("STARBUCKS COFFEE 4412", "-7.85", "credit"),
    ("MCDONALD'S F12345", "-14.20", "chequing"),
    ("UBER EATS HELP.UBER.COM", "-32.60", "credit"),
    ("SKIP THE DISHES TORONTO", "-28.95", "credit"),
    ("DOORDASH *CHIPOTLE", "-19.40", "credit"),
    ("PIZZA PIZZA #112", "-22.15", "chequing"),
    ("A & W #5521", "-13.80", "chequing"),
    # transport
    ("UBER TRIP HELP.UBER.COM", "-18.40", "credit"),
    ("PRESTO TORONTO", "-3.20", "chequing"),
    ("SHELL CANADA 77821", "-72.50", "credit"),
    ("PETRO-CANADA 44102", "-68.10", "credit"),
    ("EVO CAR SHARE VANCOUVER", "-24.00", "credit"),
    # housing / utilities
    ("RENT PAYMENT LANDLORD E-TRANSFER", "-1850.00", "chequing"),
    ("HYDRO ONE TORONTO", "-98.40", "chequing"),
    ("ROGERS COMMUNICATIONS", "-95.00", "chequing"),
    ("BELL CANADA", "-82.15", "chequing"),
    ("ENBRIDGE GAS", "-74.20", "chequing"),
    # subscriptions
    ("NETFLIX.COM", "-18.99", "credit"),
    ("SPOTIFY P04B1A2C3", "-11.99", "credit"),
    ("APPLE.COM/BILL", "-12.99", "credit"),
    ("AMAZON PRIME CA", "-11.99", "credit"),
    ("ADOBE *CREATIVE CLOUD", "-34.99", "credit"),
    # shopping
    ("AMAZON.CA *MARKETPLACE", "-46.70", "credit"),
    ("AMAZON.CA RETAIL", "-29.15", "credit"),
    ("WAL-MART SUPERCENTER", "-88.40", "chequing"),
    ("CANADIAN TIRE #456", "-54.30", "credit"),
    ("BEST BUY 987", "-129.99", "credit"),
    ("INDIGO BOOKS", "-34.50", "credit"),
    # health / fitness
    ("SHOPPERS DRUG MART #212", "-27.80", "chequing"),
    ("GOODLIFE FITNESS", "-59.99", "chequing"),
    ("REXALL PHARMACY", "-18.45", "chequing"),
    # entertainment / travel
    ("CINEPLEX ODEON", "-28.00", "credit"),
    ("STEAMGAMES.COM", "-19.99", "credit"),
    ("AIR CANADA", "-412.60", "credit"),
    ("UBER CANADA TORONTO", "-22.10", "credit"),
    # fees
    ("MONTHLY ACCOUNT FEE", "-4.00", "chequing"),
    ("ATM FEE SCOTIABANK", "-3.00", "chequing"),
]

_INCOME_TEMPLATES: list[tuple[str, str, str]] = [
    ("PAYROLL DEPOSIT ACME CORP", "4250.00", "chequing"),
    ("DIRECT DEPOSIT GOVERNMENT OF CANADA", "180.00", "chequing"),
    ("INTEREST PAID SAVINGS", "12.40", "savings"),
    ("E-TRANSFER RECEIVED FROM J SMITH", "60.00", "chequing"),
]

_TRANSFER_TEMPLATES: list[tuple[str, str, str]] = [
    ("CREDIT CARD PAYMENT - THANK YOU", "-500.00", "chequing"),
    ("TFR TO SAVINGS", "-200.00", "chequing"),
    ("TFR FROM CHEQUING", "200.00", "savings"),
    ("INTERAC E-TRANSFER TO ROOMMATE", "-45.00", "chequing"),
]


def _eid(prefix: str, *parts: object) -> str:
    raw = "|".join(str(p) for p in parts)
    digest = hashlib.sha256(raw.encode()).hexdigest()[:20]
    return f"{prefix}-{digest}"


def build_demo_snapshot(login_id: str, days: int = 180) -> ProviderSnapshot:
    """Build ~N days of CAD history across chequing, savings, and a credit card."""
    today = date.today()
    start = today - timedelta(days=days)

    chequing_txns: list[ProviderTransaction] = []
    savings_txns: list[ProviderTransaction] = []
    credit_txns: list[ProviderTransaction] = []

    spend_cycle = cycle(_SPEND_TEMPLATES)
    income_cycle = cycle(_INCOME_TEMPLATES)
    transfer_cycle = cycle(_TRANSFER_TEMPLATES)

    # Bi-weekly payroll on Fridays-ish
    d = start
    n = 0
    while d <= today:
        # weekday rotation for variety
        if d.weekday() == 4 and n % 2 == 0:  # every other Friday
            desc, amt, acct = next(income_cycle)
            if "PAYROLL" not in desc and "DIRECT DEPOSIT" not in desc:
                desc, amt, acct = ("PAYROLL DEPOSIT ACME CORP", "4250.00", "chequing")
            _add(chequing_txns if acct == "chequing" else savings_txns, d, desc, amt, login_id, n)
        if d.day == 1:
            # rent + utilities early month
            for desc, amt, acct in [
                ("RENT PAYMENT LANDLORD E-TRANSFER", "-1850.00", "chequing"),
                ("HYDRO ONE TORONTO", "-98.40", "chequing"),
                ("ROGERS COMMUNICATIONS", "-95.00", "chequing"),
            ]:
                n += 1
                _add(chequing_txns, d, desc, amt, login_id, n)
        if d.day == 15:
            desc, amt, acct = next(transfer_cycle)
            n += 1
            bucket = {
                "chequing": chequing_txns,
                "savings": savings_txns,
                "credit": credit_txns,
            }[acct]
            _add(bucket, d, desc, amt, login_id, n)
        # 1–3 everyday spends most weekdays
        if d.weekday() < 5:
            for _ in range(1 + (n % 3)):
                desc, amt, acct = next(spend_cycle)
                n += 1
                bucket = {
                    "chequing": chequing_txns,
                    "savings": savings_txns,
                    "credit": credit_txns,
                }[acct]
                _add(bucket, d, desc, amt, login_id, n)
        # weekend dining / entertainment
        if d.weekday() >= 5:
            desc, amt, acct = next(spend_cycle)
            n += 1
            bucket = credit_txns if acct == "credit" else chequing_txns
            _add(bucket, d, desc, amt, login_id, n)
            if n % 2 == 0:
                n += 1
                _add(credit_txns, d, "CINEPLEX ODEON", "-28.00", login_id, n)
        d += timedelta(days=1)
        n += 1

    # Interest on savings monthly
    for month_offset in range(days // 30):
        iday = start + timedelta(days=28 * month_offset + 5)
        if iday <= today:
            _add(
                savings_txns,
                iday,
                "INTEREST PAID SAVINGS",
                "12.40",
                login_id,
                f"int-{month_offset}",
            )

    chequing_bal = _ending_balance(chequing_txns, Decimal("3200.00"))
    savings_bal = _ending_balance(savings_txns, Decimal("8500.00"))
    credit_bal = _ending_balance(credit_txns, Decimal("-1240.55"))  # amount owed style

    return ProviderSnapshot(
        request_id=_eid("req", login_id, days),
        institution_name="Scotiabank (Demo)",
        accounts=[
            ProviderAccount(
                external_id="demo-chequing-1",
                name="Everyday Chequing",
                type="chequing",
                currency="CAD",
                balance=chequing_bal,
                masked_number="4821",
                transactions=chequing_txns,
            ),
            ProviderAccount(
                external_id="demo-savings-1",
                name="Momentum Savings",
                type="savings",
                currency="CAD",
                balance=savings_bal,
                masked_number="9012",
                transactions=savings_txns,
            ),
            ProviderAccount(
                external_id="demo-credit-1",
                name="Scene+ Visa",
                type="credit",
                currency="CAD",
                balance=credit_bal,
                masked_number="7733",
                transactions=credit_txns,
            ),
        ],
    )


def _add(
    bucket: list[ProviderTransaction],
    day: date,
    description: str,
    amount: str,
    login_id: str,
    salt: object,
) -> None:
    amt = Decimal(amount)
    bucket.append(
        ProviderTransaction(
            external_id=_eid("txn", login_id, day.isoformat(), description, amount, salt),
            date=day,
            description=description,
            amount=amt,
            currency="CAD",
        )
    )


def _ending_balance(txns: list[ProviderTransaction], start: Decimal) -> Decimal:
    total = start + sum((t.amount for t in txns), Decimal("0"))
    return total.quantize(Decimal("0.01"))


class DemoSeedProvider:
    """In-process bank provider for QA. Activated by login_id prefix `demo-seed:`."""

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        if not login_id.startswith("demo-seed:"):
            raise ValueError("DemoSeedProvider only handles demo-seed: login ids")
        # Optional suffix controls depth: demo-seed:180
        parts = login_id.split(":")
        days = 180
        if len(parts) >= 3 and parts[2].isdigit():
            days = max(30, min(int(parts[2]), 365))
        return build_demo_snapshot(login_id, days=days)
