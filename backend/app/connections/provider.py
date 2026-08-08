"""Aggregator-agnostic provider interface.

The rest of the app never talks to Flinks directly; it consumes this interface
so the aggregator can be swapped (or mixed) later without touching sync logic.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Protocol


class ProviderError(Exception):
    """Raised when the aggregator rejects a request or returns bad data."""

    def __init__(self, message: str, *, code: str | None = None):
        super().__init__(message)
        self.code = code


@dataclass
class ProviderTransaction:
    external_id: str
    date: date
    description: str
    # Positive = money in, negative = money out.
    amount: Decimal
    currency: str
    balance: Decimal | None = None


@dataclass
class ProviderHolding:
    external_id: str
    symbol: str
    name: str | None
    quantity: Decimal
    price: Decimal | None
    market_value: Decimal
    currency: str


@dataclass
class ProviderAccount:
    external_id: str
    name: str
    type: str
    currency: str
    balance: Decimal
    masked_number: str | None = None
    transactions: list[ProviderTransaction] = field(default_factory=list)
    holdings: list[ProviderHolding] = field(default_factory=list)


@dataclass
class ProviderSnapshot:
    request_id: str
    institution_name: str | None
    accounts: list[ProviderAccount]


class BankProvider(Protocol):
    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        """Exchange a widget login id for full account + transaction data."""
        ...
