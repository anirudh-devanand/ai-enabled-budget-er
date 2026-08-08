"""SnapTrade brokerage aggregator (Wealthsimple, IBKR, …).

Commercial API: one SnapTrade user per Woney user. Connection login ids:
  snaptrade:{authorization_id}:{snaptrade_user_id}:{user_secret}

Account balance = total equity (cash + positions) for net worth.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.provider import (
    ProviderAccount,
    ProviderError,
    ProviderHolding,
    ProviderSnapshot,
    ProviderTransaction,
)
from app.core.config import get_settings
from app.core.security import decrypt_secret, encrypt_secret
from app.users.models import User

logger = logging.getLogger(__name__)

LOGIN_PREFIX = "snaptrade:"

# Known broker slugs for Connect UI shortcuts (SnapTrade integrations table).
BROKER_SLUGS = {
    "wealthsimple": "WEALTHSIMPLE",
    "ibkr": "INTERACTIVE-BROKERS",
    "interactive-brokers": "INTERACTIVE-BROKERS",
}


def encode_login_id(authorization_id: str, user_id: str, user_secret: str) -> str:
    return f"{LOGIN_PREFIX}{authorization_id}:{user_id}:{user_secret}"


def parse_login_id(login_id: str) -> tuple[str, str, str]:
    if not login_id.startswith(LOGIN_PREFIX):
        raise ProviderError("Not a SnapTrade connection")
    rest = login_id.removeprefix(LOGIN_PREFIX)
    parts = rest.split(":", 2)
    if len(parts) != 3 or not all(parts):
        raise ProviderError("Invalid SnapTrade connection credentials")
    return parts[0], parts[1], parts[2]


def _dec(value: Any, default: str = "0") -> Decimal:
    if value is None:
        return Decimal(default)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def _client():
    settings = get_settings()
    if not settings.snaptrade_configured:
        raise ProviderError("SnapTrade is not configured")
    from snaptrade_client import SnapTrade, SnapTradeAuth

    return SnapTrade(
        auth=SnapTradeAuth.commercial_api_key(
            consumer_key=settings.snaptrade_consumer_key,
            client_id=settings.snaptrade_client_id,
        )
    )


def _body(resp: Any) -> Any:
    if resp is None:
        return None
    if hasattr(resp, "body"):
        return resp.body
    return resp


async def ensure_snaptrade_user(db: AsyncSession, user: User) -> tuple[str, str]:
    """Register SnapTrade user if needed; return (user_id, user_secret)."""
    if user.snaptrade_user_id and user.snaptrade_user_secret_encrypted:
        return user.snaptrade_user_id, decrypt_secret(user.snaptrade_user_secret_encrypted)

    settings = get_settings()
    if not settings.snaptrade_configured:
        raise ProviderError("SnapTrade is not configured")

    snaptrade_user_id = str(user.id)
    client = _client()

    def _register() -> dict:
        try:
            resp = client.authentication.register_snap_trade_user(user_id=snaptrade_user_id)
            body = _body(resp)
            if not isinstance(body, dict) or not body.get("userSecret"):
                raise ProviderError("SnapTrade registration returned no user secret")
            return body
        except ProviderError:
            raise
        except Exception as exc:  # noqa: BLE001 — normalize SDK errors
            msg = str(exc)
            if "already" in msg.lower() or "409" in msg:
                raise ProviderError(
                    "SnapTrade user already exists but secret is missing. Contact support."
                ) from exc
            raise ProviderError("Could not register brokerage user") from exc

    body = await asyncio.to_thread(_register)
    secret = str(body["userSecret"])
    user.snaptrade_user_id = str(body.get("userId") or snaptrade_user_id)
    user.snaptrade_user_secret_encrypted = encrypt_secret(secret)
    await db.commit()
    await db.refresh(user)
    return user.snaptrade_user_id, secret


async def create_portal_url(
    *,
    user_id: str,
    user_secret: str,
    custom_redirect: str | None = None,
    broker: str | None = None,
    reconnect: str | None = None,
) -> str:
    client = _client()
    kwargs: dict[str, Any] = {
        "user_id": user_id,
        "user_secret": user_secret,
        "connection_type": "read",
        "immediate_redirect": True,
    }
    if custom_redirect:
        kwargs["custom_redirect"] = custom_redirect
    if broker:
        slug = BROKER_SLUGS.get(broker.strip().lower(), broker.strip().upper())
        kwargs["broker"] = slug
    if reconnect:
        kwargs["reconnect"] = reconnect

    def _login() -> str:
        try:
            resp = client.authentication.login_snap_trade_user(**kwargs)
        except TypeError:
            resp = client.authentication.login_snap_trade_user(
                user_id=user_id,
                user_secret=user_secret,
            )
        body = _body(resp)
        if isinstance(body, str) and body.startswith("http"):
            return body
        if isinstance(body, dict):
            for key in ("redirectURI", "redirectUri", "loginLink", "url"):
                if body.get(key):
                    return str(body[key])
        raise ProviderError("SnapTrade did not return a connection portal URL")

    return await asyncio.to_thread(_login)


async def list_authorizations(*, user_id: str, user_secret: str) -> list[dict]:
    client = _client()

    def _list() -> list[dict]:
        try:
            resp = client.connections.list_brokerage_authorizations(
                user_id=user_id, user_secret=user_secret
            )
        except AttributeError:
            resp = client.connections.list(user_id=user_id, user_secret=user_secret)
        body = _body(resp)
        if isinstance(body, list):
            return [b for b in body if isinstance(b, dict)]
        return []

    return await asyncio.to_thread(_list)


def _institution_name(auth: dict | None) -> str | None:
    if not auth:
        return None
    brokerage = auth.get("brokerage") or {}
    if isinstance(brokerage, dict):
        return brokerage.get("name") or brokerage.get("slug")
    return auth.get("name")


def _parse_activity_date(raw: Any) -> date | None:
    if raw is None:
        return None
    text = str(raw)
    try:
        if "T" in text:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _activity_amount(act: dict) -> Decimal:
    """Map SnapTrade activity to Woney sign: +in / −out."""
    typ = str(act.get("type") or act.get("activity_type") or "").upper()
    amount = _dec(act.get("amount") or act.get("net_cash") or act.get("trade_value"))
    if amount == 0:
        units = _dec(act.get("units") or act.get("quantity"))
        price = _dec(act.get("price"))
        amount = abs(units * price)
    amount = abs(amount)
    if typ in {"BUY", "FEE", "TAX", "WITHDRAWAL"}:
        return -amount
    if typ in {"SELL", "DIVIDEND", "INTEREST", "DISTRIBUTION", "CONTRIBUTION", "DEPOSIT"}:
        return amount
    raw = act.get("amount")
    if raw is not None:
        return _dec(raw)
    return Decimal("0")


def _holding_from_position(pos: dict) -> ProviderHolding | None:
    symbol_obj = pos.get("symbol") or pos.get("universal_symbol") or {}
    if isinstance(symbol_obj, dict):
        nested = symbol_obj.get("symbol") if isinstance(symbol_obj.get("symbol"), dict) else symbol_obj
        ticker = (
            nested.get("raw_symbol")
            or nested.get("symbol")
            or nested.get("ticker")
            or symbol_obj.get("raw_symbol")
            or symbol_obj.get("id")
        )
        name = nested.get("description") or nested.get("name") or symbol_obj.get("description")
        ext = str(symbol_obj.get("id") or ticker or "")
    else:
        ticker = str(symbol_obj or pos.get("ticker") or "")
        name = None
        ext = ticker
    if not ticker and not ext:
        return None
    qty = _dec(pos.get("units") or pos.get("quantity") or pos.get("open_quantity"))
    price = pos.get("price") or pos.get("average_purchase_price")
    price_d = _dec(price) if price is not None else None
    mv = pos.get("market_value") or pos.get("value")
    if mv is None and price_d is not None:
        mv = qty * price_d
    currency = "CAD"
    cur = pos.get("currency")
    if isinstance(cur, dict):
        currency = str(cur.get("code") or cur.get("id") or "CAD")[:3]
    elif isinstance(cur, str) and cur:
        currency = cur[:3]
    return ProviderHolding(
        external_id=str(ext)[:128],
        symbol=str(ticker or ext)[:64],
        name=(str(name)[:200] if name else None),
        quantity=qty,
        price=price_d,
        market_value=_dec(mv),
        currency=currency.upper(),
    )


class SnapTradeProvider:
    """Fetches accounts, equity balance, holdings, and recent activities."""

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        authorization_id, user_id, user_secret = parse_login_id(login_id)
        client = _client()

        def _fetch() -> ProviderSnapshot:
            try:
                auths: list[dict] = []
                try:
                    resp = client.connections.list_brokerage_authorizations(
                        user_id=user_id, user_secret=user_secret
                    )
                    body = _body(resp)
                    if isinstance(body, list):
                        auths = [a for a in body if isinstance(a, dict)]
                except Exception:  # noqa: BLE001
                    logger.exception("list_brokerage_authorizations failed")

                auth = next(
                    (a for a in auths if str(a.get("id")) == authorization_id),
                    None,
                )
                institution = _institution_name(auth) or "Brokerage"

                accounts_resp = client.account_information.list_user_accounts(
                    user_id=user_id, user_secret=user_secret
                )
                accounts_body = _body(accounts_resp)
                if not isinstance(accounts_body, list):
                    accounts_body = []

                end = datetime.now(UTC).date()
                start = end - timedelta(days=365)
                provider_accounts: list[ProviderAccount] = []

                for acct in accounts_body:
                    if not isinstance(acct, dict):
                        continue
                    auth_ref = acct.get("brokerage_authorization") or acct.get(
                        "brokerage_authorization_id"
                    )
                    if auth_ref and str(auth_ref) != authorization_id:
                        continue
                    acct_id = str(acct.get("id") or "")
                    if not acct_id:
                        continue

                    balance = Decimal("0")
                    try:
                        bal_resp = client.account_information.get_user_account_balance(
                            account_id=acct_id,
                            user_id=user_id,
                            user_secret=user_secret,
                        )
                        bal_body = _body(bal_resp)
                        if isinstance(bal_body, list):
                            for b in bal_body:
                                if not isinstance(b, dict):
                                    continue
                                for key in ("total", "market_value", "total_value", "cash"):
                                    if b.get(key) is not None:
                                        balance = _dec(b[key])
                                        break
                                else:
                                    cash = b.get("cash")
                                    if isinstance(cash, dict) and cash.get("amount") is not None:
                                        balance = _dec(cash["amount"])
                        elif isinstance(bal_body, dict):
                            balance = _dec(
                                bal_body.get("total")
                                or bal_body.get("market_value")
                                or bal_body.get("cash")
                            )
                    except Exception:  # noqa: BLE001
                        logger.exception("balance fetch failed for %s", acct_id)

                    holdings: list[ProviderHolding] = []
                    try:
                        pos_resp = client.account_information.get_user_account_positions(
                            account_id=acct_id,
                            user_id=user_id,
                            user_secret=user_secret,
                        )
                        pos_body = _body(pos_resp)
                        positions: list = []
                        if isinstance(pos_body, list):
                            positions = pos_body
                        elif isinstance(pos_body, dict):
                            positions = (
                                pos_body.get("positions")
                                or pos_body.get("stock_positions")
                                or []
                            )
                        for pos in positions:
                            if isinstance(pos, dict):
                                h = _holding_from_position(pos)
                                if h:
                                    holdings.append(h)
                    except Exception:  # noqa: BLE001
                        logger.exception("positions fetch failed for %s", acct_id)

                    if balance == 0 and holdings:
                        balance = sum((h.market_value for h in holdings), Decimal("0"))

                    transactions: list[ProviderTransaction] = []
                    try:
                        act_resp = client.account_information.get_account_activities(
                            account_id=acct_id,
                            user_id=user_id,
                            user_secret=user_secret,
                            start_date=start.isoformat(),
                            end_date=end.isoformat(),
                        )
                        act_body = _body(act_resp)
                        activities: list = []
                        if isinstance(act_body, dict):
                            activities = act_body.get("data") or act_body.get("activities") or []
                        elif isinstance(act_body, list):
                            activities = act_body
                        for act in activities:
                            if not isinstance(act, dict):
                                continue
                            d = _parse_activity_date(
                                act.get("trade_date")
                                or act.get("settlement_date")
                                or act.get("date")
                            )
                            if d is None:
                                continue
                            ext = str(
                                act.get("id")
                                or act.get("external_reference_id")
                                or f"{acct_id}-{d}-{act.get('type')}-{act.get('description')}"
                            )[:64]
                            desc = str(
                                act.get("description")
                                or act.get("type")
                                or "Brokerage activity"
                            )[:500]
                            amount = _activity_amount(act)
                            if amount == 0:
                                continue
                            currency = "CAD"
                            cur = act.get("currency")
                            if isinstance(cur, dict):
                                currency = str(cur.get("code") or "CAD")[:3]
                            elif isinstance(cur, str) and cur:
                                currency = cur[:3]
                            transactions.append(
                                ProviderTransaction(
                                    external_id=ext,
                                    date=d,
                                    description=desc,
                                    amount=amount,
                                    currency=currency.upper(),
                                )
                            )
                    except Exception:  # noqa: BLE001
                        logger.exception("activities fetch failed for %s", acct_id)

                    meta = acct.get("meta") if isinstance(acct.get("meta"), dict) else {}
                    name = str(
                        acct.get("name")
                        or meta.get("name")
                        or acct.get("number")
                        or "Investment account"
                    )[:120]
                    currency = "CAD"
                    cur = acct.get("currency")
                    if isinstance(cur, dict):
                        currency = str(cur.get("code") or "CAD")[:3]
                    elif isinstance(cur, str) and cur:
                        currency = cur[:3]

                    provider_accounts.append(
                        ProviderAccount(
                            external_id=acct_id[:64],
                            name=name,
                            type="investment",
                            currency=currency.upper(),
                            balance=balance,
                            transactions=transactions,
                            holdings=holdings,
                        )
                    )

                return ProviderSnapshot(
                    request_id=str(uuid.uuid4()),
                    institution_name=institution,
                    accounts=provider_accounts,
                )
            except ProviderError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("SnapTrade snapshot failed")
                raise ProviderError("Could not sync brokerage account") from exc

        return await asyncio.to_thread(_fetch)
