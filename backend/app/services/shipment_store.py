"""
In-memory shipment result store.

Phase 4 (DDS XML generation) needs to retrieve a previously-processed
shipment by ID from a separate request. The platform has no persistence
layer yet, so — per the Phase 4 spec's explicit allowance to "accept
either the latest processed shipment stored in memory OR an existing
database model" without redesigning the database — this stores completed
`ShipmentUploadResponse` objects in process memory, keyed by shipment ID.

**Known limitation, by design for this phase:** this store is a single
process's dict. It does NOT survive a restart and does NOT share state
across multiple worker processes (e.g. `uvicorn --workers 4` or multiple
Railway replicas). The moment a real database or cache (Postgres, Redis)
is introduced, this class's public interface (`save` / `get`) is exactly
what a persistent implementation should also expose, so callers
(`ShipmentProcessingService`, the XML export route) never need to change.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from threading import Lock

from app.core.logging import get_logger
from app.schemas.responses import ShipmentUploadResponse

logger = get_logger(__name__)

# How long a processed shipment remains retrievable. Prevents unbounded
# memory growth in a long-running process with no persistence layer.
_DEFAULT_TTL_SECONDS = 24 * 60 * 60  # 24 hours


@dataclass(slots=True)
class _StoredEntry:
    response: ShipmentUploadResponse
    stored_at: float


class InMemoryShipmentStore:
    """Thread-safe, process-local store of completed shipment results."""

    def __init__(self, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
        self._entries: dict[str, _StoredEntry] = {}
        self._lock = Lock()
        self._ttl_seconds = ttl_seconds

    def save(self, response: ShipmentUploadResponse) -> None:
        """Store a completed shipment result, keyed by its shipment_id."""
        with self._lock:
            self._entries[response.shipment_id] = _StoredEntry(
                response=response, stored_at=time.monotonic()
            )
        logger.info(
            "Shipment %s stored in memory (%d total in store).",
            response.shipment_id,
            len(self._entries),
        )

    def get(self, shipment_id: str) -> ShipmentUploadResponse | None:
        """Retrieve a stored shipment result, or None if absent or expired."""
        with self._lock:
            entry = self._entries.get(shipment_id)
            if entry is None:
                return None

            age_seconds = time.monotonic() - entry.stored_at
            if age_seconds > self._ttl_seconds:
                logger.info(
                    "Shipment %s expired from in-memory store (age=%.0fs).",
                    shipment_id,
                    age_seconds,
                )
                del self._entries[shipment_id]
                return None

            return entry.response
