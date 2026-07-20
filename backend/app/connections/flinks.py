"""Flinks banking API client (Canadian aggregator, covers banks and fintechs
like Neo Financial and EQ Bank).

Flow: the Flinks Connect iframe hands the frontend a loginId; we exchange it
for a requestId via /Authorize, then pull accounts and transactions with
/GetAccountsDetail (polling /GetAccountsDetailAsync while the job runs).
"""

import asyncio
import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.core.config import get_settings
from app.connections.provider import (
    ProviderAccount,
    ProviderError,
    ProviderSnapshot,
    ProviderTransaction,
)

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 5
_POLL_MAX_ATTEMPTS = 60


class FlinksProvider:
    def __init__(self) -> None:
        settings = get_settings()
        self._base = f"{settings.flinks_base_url}/v3/{settings.flinks_customer_id}/BankingServices"
        self._auth_key = settings.flinks_auth_key
        self._days = settings.flinks_days_of_transactions

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._auth_key:
            headers["flinks-auth-key"] = self._auth_key
        return headers

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        async with httpx.AsyncClient(timeout=240) as client:
            request_id = await self._authorize(client, login_id)
            payload = await self._get_accounts_detail(client, request_id)
        return _parse_snapshot(request_id, payload)

    async def _authorize(self, client: httpx.AsyncClient, login_id: str) -> str:
        resp = await client.post(
            f"{self._base}/Authorize",
            json={"LoginId": login_id, "MostRecentCached": True},
            headers=self._headers(),
        )
        if resp.status_code not in (200, 203):
            raise ProviderError(f"Flinks Authorize failed with status {resp.status_code}")
        request_id = resp.json().get("RequestId")
        if not request_id:
            raise ProviderError("Flinks Authorize response missing RequestId")
        return request_id

    async def _get_accounts_detail(
        self, client: httpx.AsyncClient, request_id: str
    ) -> dict[str, Any]:
        resp = await client.post(
            f"{self._base}/GetAccountsDetail",
            json={
                "RequestId": request_id,
                "WithBalance": True,
                "WithTransactions": True,
                "DaysOfTransactions": self._days,
            },
            headers=self._headers(),
        )
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code != 202:
            raise ProviderError(f"Flinks GetAccountsDetail failed with status {resp.status_code}")

        # Long-running job: poll the async endpoint until it settles.
        for _ in range(_POLL_MAX_ATTEMPTS):
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)
            poll = await client.get(
                f"{self._base}/GetAccountsDetailAsync/{request_id}", headers=self._headers()
            )
            if poll.status_code == 200:
                return poll.json()
            if poll.status_code != 202:
                raise ProviderError(
                    f"Flinks GetAccountsDetailAsync failed with status {poll.status_code}"
                )
        raise ProviderError("Flinks GetAccountsDetail timed out")


def _decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def _parse_transaction(raw: dict[str, Any], currency: str) -> ProviderTransaction | None:
    external_id = raw.get("Id")
    raw_date = raw.get("Date")
    if not external_id or not raw_date:
        return None
    credit = _decimal(raw.get("Credit"))
    debit = _decimal(raw.get("Debit"))
    if credit is not None:
        amount = credit
    elif debit is not None:
        amount = -debit
    else:
        return None
    return ProviderTransaction(
        external_id=str(external_id),
        date=date.fromisoformat(str(raw_date)[:10]),
        description=str(raw.get("Description") or ""),
        amount=amount,
        currency=currency,
        balance=_decimal(raw.get("Balance")),
    )


def _parse_snapshot(request_id: str, payload: dict[str, Any]) -> ProviderSnapshot:
    accounts: list[ProviderAccount] = []
    for raw in payload.get("Accounts") or []:
        external_id = raw.get("Id")
        if not external_id:
            continue
        currency = str(raw.get("Currency") or "CAD")
        balance = _decimal((raw.get("Balance") or {}).get("Current"))
        transactions = [
            parsed
            for t in raw.get("Transactions") or []
            if (parsed := _parse_transaction(t, currency)) is not None
        ]
        accounts.append(
            ProviderAccount(
                external_id=str(external_id),
                name=str(raw.get("Title") or raw.get("Category") or "Account"),
                type=str(raw.get("Category") or "Unknown"),
                currency=currency,
                balance=balance if balance is not None else Decimal("0"),
                masked_number=str(raw.get("AccountNumber") or "")[-4:] or None,
                transactions=transactions,
            )
        )
    if not accounts:
        logger.warning("Flinks snapshot for request %s contained no accounts", request_id)
    return ProviderSnapshot(
        request_id=request_id,
        institution_name=payload.get("Institution"),
        accounts=accounts,
    )
