"""Parse bank CSV / simple OFX-ish exports into a ProviderSnapshot.

Designed for Neo and other banks that lack a free aggregator: users download a
statement CSV and upload it. Column detection is heuristic (Canadian bank
exports vary).
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable

from app.connections.provider import (
    ProviderAccount,
    ProviderError,
    ProviderSnapshot,
    ProviderTransaction,
)

_DATE_FORMATS = (
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%b %d, %Y",
    "%d %b %Y",
)

_DATE_KEYS = ("date", "transaction date", "posted date", "posting date", "trans date")
_DESC_KEYS = ("description", "memo", "details", "payee", "narrative", "transaction", "name")
_AMOUNT_KEYS = ("amount", "cad$", "cad", "value", "transaction amount")
_DEBIT_KEYS = ("debit", "withdrawal", "money out", "outflow")
_CREDIT_KEYS = ("credit", "deposit", "money in", "inflow")


def _norm(header: str) -> str:
    return re.sub(r"\s+", " ", header.strip().lower())


def _pick(headers: list[str], candidates: Iterable[str]) -> str | None:
    normalized = {_norm(h): h for h in headers}
    for cand in candidates:
        if cand in normalized:
            return normalized[cand]
    for key, original in normalized.items():
        for cand in candidates:
            if cand in key:
                return original
    return None


def _parse_date(raw: str) -> date | None:
    text = raw.strip().strip('"')
    if not text:
        return None
    if "T" in text:
        text = text.split("T", 1)[0]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(raw: str) -> Decimal | None:
    text = raw.strip().strip('"').replace(",", "").replace("$", "").replace("CAD", "").strip()
    if not text or text in {"-", "—"}:
        return None
    # Accounting negatives: (42.50)
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_bank_csv(
    content: bytes | str,
    *,
    account_name: str,
    account_type: str = "chequing",
    currency: str = "CAD",
    institution_name: str | None = None,
) -> ProviderSnapshot:
    if isinstance(content, bytes):
        text = content.decode("utf-8-sig", errors="replace")
    else:
        text = content
    # Drop blank / preamble lines until a header-looking row appears
    lines = text.splitlines()
    start = 0
    for i, line in enumerate(lines[:30]):
        lower = line.lower()
        if "date" in lower and ("amount" in lower or "debit" in lower or "credit" in lower or "description" in lower):
            start = i
            break
    sample = "\n".join(lines[start:])
    try:
        reader = csv.DictReader(io.StringIO(sample))
    except csv.Error as exc:
        raise ProviderError(f"Could not read CSV: {exc}") from exc
    if not reader.fieldnames:
        raise ProviderError("CSV has no header row")

    headers = list(reader.fieldnames)
    date_col = _pick(headers, _DATE_KEYS)
    desc_col = _pick(headers, _DESC_KEYS)
    amount_col = _pick(headers, _AMOUNT_KEYS)
    debit_col = _pick(headers, _DEBIT_KEYS)
    credit_col = _pick(headers, _CREDIT_KEYS)
    if not date_col or not desc_col:
        raise ProviderError(
            "CSV needs recognizable Date and Description columns "
            f"(found: {', '.join(headers)})"
        )
    if not amount_col and not (debit_col or credit_col):
        raise ProviderError(
            "CSV needs an Amount column or Debit/Credit columns "
            f"(found: {', '.join(headers)})"
        )

    txns: list[ProviderTransaction] = []
    running = Decimal("0")
    for idx, row in enumerate(reader):
        raw_date = (row.get(date_col) or "").strip()
        txn_date = _parse_date(raw_date)
        if txn_date is None:
            continue
        desc = (row.get(desc_col) or "").strip() or "Imported transaction"
        amount: Decimal | None = None
        if amount_col:
            amount = _parse_amount(row.get(amount_col) or "")
        else:
            debit = _parse_amount(row.get(debit_col) or "") if debit_col else None
            credit = _parse_amount(row.get(credit_col) or "") if credit_col else None
            if credit is not None and credit != 0:
                amount = abs(credit)
            elif debit is not None and debit != 0:
                amount = -abs(debit)
        if amount is None:
            continue
        # Heuristic: if a single Amount column is always positive with a type column,
        # leave as-is; many Canadian exports already sign amounts (negative = spend).
        running += amount
        seed = f"{txn_date.isoformat()}|{desc}|{amount}|{idx}"
        external_id = hashlib.sha256(seed.encode()).hexdigest()[:64]
        txns.append(
            ProviderTransaction(
                external_id=external_id,
                date=txn_date,
                description=desc[:500],
                amount=amount,
                currency=currency.upper()[:3],
            )
        )

    if not txns:
        raise ProviderError("No transactions could be parsed from the CSV")

    account_id = hashlib.sha256(f"{account_name}|{account_type}|{currency}".encode()).hexdigest()[:32]
    return ProviderSnapshot(
        request_id=f"csv-{account_id}",
        institution_name=institution_name or "CSV import",
        accounts=[
            ProviderAccount(
                external_id=f"csv-{account_id}"[:64],
                name=account_name[:120],
                type=account_type[:40],
                currency=currency.upper()[:3],
                balance=running,
                masked_number=None,
                transactions=txns,
            )
        ],
    )
