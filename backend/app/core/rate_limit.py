"""Simple in-process sliding-window rate limiter for auth surfaces.

Fine for a single Render instance. For multi-instance, move to Redis later.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(
    request: Request,
    *,
    bucket: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Raise 429 if this client exceeded `limit` hits in `window_seconds`."""
    key = f"{bucket}:{_client_ip(request)}"
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        q = _hits[key]
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many attempts. Please wait a moment and try again.",
            )
        q.append(now)


def reset_rate_limits_for_tests() -> None:
    with _lock:
        _hits.clear()
