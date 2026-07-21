"""
Shipment ORM model.

This is the authoritative, RLS-protected, organization-scoped **ownership
record** for a processed shipment — the row every tenant-isolation check
in the API layer is actually made against. As of this revision it also
stores the full result payload (`payload`, JSONB) alongside a flattened
compliance *summary* (documents processed, confidence, risk counts,
commodity/country) so the shipments list, dashboard, and compliance
overview pages can query cheap aggregate columns directly instead of
parsing the full JSON payload for every row.

`InMemoryShipmentStore` (`app/services/shipment_store.py`) still exists as
a fast, process-local cache the upload response itself is built from, but
it is no longer the only place a shipment's full detail can be read from
— `GET /shipments/{id}` falls back to this table's `payload` column when
the in-memory cache has expired, belongs to a different worker process,
or the server has restarted since the shipment was processed.

`app/services/shipment_processor.py` writes one row here (summary columns
+ full payload) at the same moment it saves the result to the in-memory
store.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Shipment(Base):
    """Organization-scoped ownership + compliance-summary record for a processed shipment."""

    __tablename__ = "shipments"
    __table_args__ = (
        Index("ix_shipments_organization_id", "organization_id"),
        Index("ix_shipments_organization_id_created_at", "organization_id", "created_at"),
        {
            "comment": (
                "Organization-scoped ownership ledger + compliance summary for "
                "processed shipments. The full per-document extraction payload "
                "lives in the in-memory shipment store (see "
                "app/services/shipment_store.py) — this row is the durable, "
                "RLS-protected record of which organization/user a shipment "
                "belongs to, plus enough summary data to list and aggregate "
                "shipments without depending on that cache."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, comment="Matches the shipment_id used everywhere else."
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="SET NULL"), nullable=True
    )
    source_filename: Mapped[str | None] = mapped_column(String(500), nullable=True)
    declared_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    readiness: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # --- Compliance summary snapshot (Phase 8) ---
    # Best-effort, taken at processing time. Nullable throughout because a
    # shipment processed before this migration landed simply won't have
    # these — the list/dashboard/compliance endpoints all treat null here
    # as "unknown", never as zero.
    documents_processed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    critical_farms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verified_farms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pending_verification: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mass_balance_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    commodity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    country_of_production: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Full result payload (Phase 8 continuation) ---
    # The complete ShipmentUploadResponse JSON (documents + compliance),
    # exactly as returned by POST /shipments/upload-zip. Makes Postgres —
    # not the in-memory shipment store — the durable source of truth for
    # "can this shipment's detail page render", so it survives a restart,
    # a different worker process, or a different browser session/device.
    # Nullable because rows written before this column existed won't have
    # it, and because the write happens in the same best-effort, never-
    # crashes-the-pipeline block as the rest of this row (see
    # `ShipmentProcessingService._record_shipment_ownership`).
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Shipment(id={self.id!r}, organization_id={self.organization_id!r})"
