"""Plaid bank aggregation client (Canada-friendly indie path).

Flow: frontend opens Plaid Link with a link_token from /link/token/create;
onSuccess yields a public_token; we exchange it for an access_token and store
that encrypted (same role as a Flinks loginId). Sync pulls accounts +
transactions via /accounts/get and /transactions/get.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx

from app.connections.provider import (
    ProviderAccount,
    ProviderError,
    ProviderSnapshot,
    ProviderTransaction,
)
from app.core.config import get_settings

logger = logging.getLogger(__name__)

_HOSTS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def _eid(raw: str) -> str:
    """Fit Plaid ids into our String(64) columns without collisions."""
    if len(raw) <= 64:
        return raw
    return hashlib.sha256(raw.encode()).hexdigest()[:64]


def _host(env: str) -> str:
    return _HOSTS.get(env.strip().lower(), _HOSTS["sandbox"])


def _map_account_type(subtype: str | None, type_: str | None) -> str:
    key = (subtype or type_ or "").lower()
    if key in {"checking", "chequing"}:
        return "chequing"
    if key in {"savings", "tfsa", "rrsp", "money market", "cd"}:
        return "savings"
    if key in {"credit card", "credit", "paypal"} or (type_ or "").lower() == "credit":
        return "credit"
    if key in {"loan", "mortgage"} or (type_ or "").lower() == "loan":
        return "loan"
    if (type_ or "").lower() == "investment":
        return "investment"
    return type_ or subtype or "other"


class PlaidProvider:
    """`login_id` for this provider is a Plaid access_token."""

    async def create_link_token(self, *, client_user_id: str) -> str:
        settings = get_settings()
        if not settings.plaid_configured:
            raise ProviderError(
                "Plaid is not configured (set WONEY_PLAID_CLIENT_ID and WONEY_PLAID_SECRET "
                "— or legacy LEDGER_PLAID_* — on the Render API service, not only on Vercel; "
                "redeploy, then GET /healthz should show plaid_configured: true)"
            )
        body = {
            "client_id": settings.plaid_client_id,
            "secret": settings.plaid_secret,
            "client_name": "Woney",
            "language": "en",
            "country_codes": [c.strip().upper() for c in settings.plaid_country_codes.split(",") if c.strip()],
            "user": {"client_user_id": client_user_id},
            "products": [p.strip() for p in settings.plaid_products.split(",") if p.strip()],
        }
        data = await self._post("/link/token/create", body)
        token = data.get("link_token")
        if not token:
            raise ProviderError("Plaid did not return a link_token")
        return str(token)

    async def exchange_public_token(self, public_token: str) -> str:
        settings = get_settings()
        data = await self._post(
            "/item/public_token/exchange",
            {
                "client_id": settings.plaid_client_id,
                "secret": settings.plaid_secret,
                "public_token": public_token,
            },
        )
        access = data.get("access_token")
        if not access:
            raise ProviderError("Plaid did not return an access_token")
        return str(access)

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        settings = get_settings()
        if not settings.plaid_configured:
            raise ProviderError("Plaid is not configured")
        access_token = login_id
        auth = {
            "client_id": settings.plaid_client_id,
            "secret": settings.plaid_secret,
            "access_token": access_token,
        }
        item = await self._post("/item/get", auth)
        institution_name: str | None = None
        inst_id = (item.get("item") or {}).get("institution_id")
        if inst_id:
            try:
                inst = await self._post(
                    "/institutions/get_by_id",
                    {
                        "client_id": settings.plaid_client_id,
                        "secret": settings.plaid_secret,
                        "institution_id": inst_id,
                        "country_codes": [
                            c.strip().upper()
                            for c in settings.plaid_country_codes.split(",")
                            if c.strip()
                        ],
                    },
                )
                institution_name = (inst.get("institution") or {}).get("name")
            except ProviderError:
                logger.warning("Could not resolve Plaid institution %s", inst_id)

        accounts_payload = await self._post("/accounts/get", auth)
        end = date.today()
        start = end - timedelta(days=max(30, min(settings.plaid_days_of_transactions, 730)))
        tx_payload = await self._post(
            "/transactions/get",
            {
                **auth,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "options": {"count": 500, "offset": 0},
            },
        )
        # Paginate if needed
        transactions = list(tx_payload.get("transactions") or [])
        total = int(tx_payload.get("total_transactions") or len(transactions))
        while len(transactions) < total and len(transactions) < 2000:
            more = await self._post(
                "/transactions/get",
                {
                    **auth,
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "options": {"count": 500, "offset": len(transactions)},
                },
            )
            batch = more.get("transactions") or []
            if not batch:
                break
            transactions.extend(batch)

        return _parse_plaid_snapshot(
            accounts_payload.get("accounts") or [],
            transactions,
            institution_name=institution_name,
            request_id=str(accounts_payload.get("request_id") or "plaid"),
        )

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        settings = get_settings()
        url = f"{_host(settings.plaid_env)}{path}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=body)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Plaid network error: {exc}") from exc
        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderError(f"Plaid returned non-JSON ({resp.status_code})") from exc
        if resp.status_code >= 400:
            err = data.get("error_message") or data.get("error_code") or resp.text
            raise ProviderError(f"Plaid {path} failed: {err}")
        return data


def _parse_plaid_snapshot(
    accounts: list[dict[str, Any]],
    transactions: list[dict[str, Any]],
    *,
    institution_name: str | None,
    request_id: str,
) -> ProviderSnapshot:
    by_account: dict[str, list[ProviderTransaction]] = {}
    for raw in transactions:
        account_id = raw.get("account_id")
        txn_id = raw.get("transaction_id")
        if not account_id or not txn_id:
            continue
        try:
            # Plaid: positive = money out. Ours: positive = money in.
            amount = -Decimal(str(raw["amount"]))
        except (KeyError, InvalidOperation):
            continue
        txn_date_raw = raw.get("date") or raw.get("authorized_date")
        if not txn_date_raw:
            continue
        try:
            txn_date = date.fromisoformat(str(txn_date_raw)[:10])
        except ValueError:
            continue
        desc = (
            raw.get("merchant_name")
            or raw.get("name")
            or raw.get("original_description")
            or "Transaction"
        )
        by_account.setdefault(str(account_id), []).append(
            ProviderTransaction(
                external_id=_eid(str(txn_id)),
                date=txn_date,
                description=str(desc)[:500],
                amount=amount,
                currency=str(raw.get("iso_currency_code") or raw.get("unofficial_currency_code") or "CAD"),
            )
        )

    parsed_accounts: list[ProviderAccount] = []
    for acc in accounts:
        acc_id = acc.get("account_id")
        if not acc_id:
            continue
        balances = acc.get("balances") or {}
        bal_raw = balances.get("current")
        if bal_raw is None:
            bal_raw = balances.get("available") or 0
        try:
            balance = Decimal(str(bal_raw))
        except InvalidOperation:
            balance = Decimal("0")
        mask = acc.get("mask")
        parsed_accounts.append(
            ProviderAccount(
                external_id=_eid(str(acc_id)),
                name=str(acc.get("name") or acc.get("official_name") or "Account")[:120],
                type=_map_account_type(acc.get("subtype"), acc.get("type")),
                currency=str(
                    balances.get("iso_currency_code")
                    or balances.get("unofficial_currency_code")
                    or "CAD"
                ),
                balance=balance,
                masked_number=str(mask)[-4:] if mask else None,
                transactions=by_account.get(str(acc_id), []),
            )
        )

    return ProviderSnapshot(
        request_id=request_id,
        institution_name=institution_name,
        accounts=parsed_accounts,
    )
