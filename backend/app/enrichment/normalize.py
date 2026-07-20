"""Descriptor normalization.

Bank descriptors are noisy: processor prefixes ("SQ *", "PAYPAL *"), store
numbers, terminal ids, city suffixes. Normalizing them gives rules and user
overrides a stable key to match against.
"""

import re

# Payment-processor and card-network prefixes that hide the real merchant.
_PREFIXES = re.compile(
    r"^(POS DEBIT|POS PURCHASE|DEBIT CARD PURCHASE|PRE-?AUTH(ORIZED)? (DEBIT|PAYMENT)|"
    r"VISA DEBIT|INTERAC PURCHASE|CONTACTLESS PURCHASE|RECURRING PAYMENT|"
    r"SQ \*|PAYPAL \*|TST\* ?|APL\* ?|GOOGLE \*|FS \*|PY \*)\s*",
    re.IGNORECASE,
)

# Trailing reference/store/terminal numbers and dates.
_TRAILING_NOISE = re.compile(r"[\s#\-]*(\d[\d\-\/#]*)\s*$")

# Runs of digits embedded in the name (store numbers, phone numbers).
_EMBEDDED_DIGITS = re.compile(r"\s*#?\d{3,}\s*")

_MULTI_SPACE = re.compile(r"\s{2,}")

_NON_ALNUM = re.compile(r"[^A-Z0-9&'\.\* ]")


def normalize_descriptor(raw: str) -> str:
    """Uppercase, strip processor prefixes and numeric noise, collapse spaces."""
    text = raw.strip().upper()
    text = _PREFIXES.sub("", text)
    # Apply repeatedly: descriptors sometimes stack prefixes.
    text = _PREFIXES.sub("", text)
    text = _NON_ALNUM.sub(" ", text)
    for _ in range(3):
        text = _TRAILING_NOISE.sub("", text)
    text = _EMBEDDED_DIGITS.sub(" ", text)
    text = _MULTI_SPACE.sub(" ", text).strip(" *-.")
    return text or raw.strip().upper() or "UNKNOWN"


def prettify_descriptor(raw: str) -> str:
    """Fallback display name when no merchant is resolved: normalized, title-cased."""
    normalized = normalize_descriptor(raw)
    return " ".join(
        word if word in {"TD", "RBC", "BMO", "CIBC", "EQ", "A&W", "KFC", "IKEA", "H&M"}
        else word.capitalize()
        for word in normalized.split()
    )
