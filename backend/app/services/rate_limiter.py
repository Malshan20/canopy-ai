"""
In-memory, per-API-key rate limiter.

Same architectural constraint as `InMemoryShipmentStore`
(app/services/shipment_store.py) and documented in exactly the same
place: this state lives in one process's memory, so it only rate-limits
correctly with `WEB_CONCURRENCY=1` (the current default — see the
Dockerfile's worker-count comment). With multiple workers, each process
would enforce its own independent limit, so the *effective* limit becomes
(configured limit x worker count). This is an honest, acceptable
trade-off for a first version — a real production rollout serving many
API-key customers at real traffic volume should replace this with a
shared store (Redis) before raising WEB_CONCURRENCY, at which point this
class's interface (`check_and_record`) is the only thing that would need
a new implementation behind it.

Algorithm: fixed 60-second window per key, counting requests since the
window started. Simpler than a sliding log or token bucket, and
sufficient for the "don't let one integration hammer us" goal this
exists for — not a precision billing mechanism.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from threading import Lock


@dataclass
class _Window:
    window_start: float
    request_count: int


class InMemoryRateLimiter:
    def __init__(self, requests_per_minute: int) -> None:
        self._limit = requests_per_minute
        self._windows: dict[str, _Window] = defaultdict(lambda: _Window(0.0, 0))
        self._lock = Lock()

    def check_and_record(self, key: str) -> tuple[bool, int]:
        """
        Records one request against `key`'s current window and reports
        whether it was allowed. Returns `(allowed, remaining_in_window)`.
        """
        now = time.monotonic()
        with self._lock:
            window = self._windows[key]
            if now - window.window_start >= 60.0:
                window.window_start = now
                window.request_count = 0

            if window.request_count >= self._limit:
                return False, 0

            window.request_count += 1
            return True, self._limit - window.request_count


# Matches the 60 requests/minute advertised for API access on the
# Enterprise/Custom pricing tiers (frontend/components/landing/pricing.tsx)
# — deliberately the same number in both places rather than two
# independent guesses that could silently drift apart.
API_KEY_REQUESTS_PER_MINUTE = 60

api_key_rate_limiter = InMemoryRateLimiter(requests_per_minute=API_KEY_REQUESTS_PER_MINUTE)
