"""Soft descriptor matching for the embedding cascade stage.

Uses token overlap (with Canadian geography noise stripped) so a household
correction for "BLUE BOTTLE ROASTERS VAN" also catches "BLUE BOTTLE COFFEE
TORONTO". Character n-gram embeddings remain available for future ranking.
"""

from __future__ import annotations

import math
import re
from collections import Counter

_DIM = 256
_TOKEN = re.compile(r"[A-Z0-9]+")

_NOISE = {
    "ON",
    "BC",
    "AB",
    "QC",
    "MB",
    "SK",
    "NS",
    "NB",
    "NL",
    "PE",
    "YT",
    "NT",
    "NU",
    "CA",
    "CANADA",
    "TORONTO",
    "VANCOUVER",
    "CALGARY",
    "OTTAWA",
    "MONTREAL",
    "EDMONTON",
    "WINNIPEG",
    "VICTORIA",
    "HAMILTON",
    "MISSISSAUGA",
    "BRAMPTON",
    "SURREY",
    "BURNABY",
    "RICHMOND",
    "VAN",
    "TO",
    "THE",
    "AND",
    "STORE",
    "SHOP",
}


def tokens(text: str) -> set[str]:
    return {t for t in _TOKEN.findall(text.upper()) if t not in _NOISE and len(t) > 1}


def token_overlap(a: str, b: str) -> float:
    """Jaccard similarity of content tokens."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def embed_text(text: str) -> list[float]:
    text = text.upper().strip()
    counts: Counter[int] = Counter()
    padded = f"  {text}  "
    for i in range(len(padded) - 2):
        counts[hash(padded[i : i + 3]) % _DIM] += 1
    toks = list(tokens(text))
    for token in toks:
        counts[hash(f"w:{token}") % _DIM] += 5
    for i in range(len(toks) - 1):
        counts[hash(f"b:{toks[i]}:{toks[i + 1]}") % _DIM] += 8
    vec = [0.0] * _DIM
    for idx, value in counts.items():
        vec[idx] = float(value)
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))
