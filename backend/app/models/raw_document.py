"""
RawDocument and ExtractedSupplyChain ORM models.

**`raw_documents` is now populated for real (Phase 10)** — one row per
document in an uploaded ZIP, written by `shipment_processor.py` alongside
the (best-effort) original file upload to Supabase Storage — see
`app/services/storage_service.py`. `extracted_supply_chain` remains
schema-ready but unpopulated: per-document extraction *results* still
live inside the in-memory shipment store's payload / `shipments.payload`
JSONB (see `app/services/shipment_store.py` and
`app/schemas/documents.DocumentResult`), not as individual rows here.
Normalizing that into real rows is a purely application-layer follow-up;
the tenant-isolation guarantees are already in place and already tested
(see `migrations/versions/..._add_multi_tenancy.py`).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RawDocument(Base):
    """A single uploaded supplier document (schema-ready; see module docstring)."""

    __tablename__ = "raw_documents"
    __table_args__ = (
        Index("ix_raw_documents_organization_id", "organization_id"),
        Index("ix_raw_documents_shipment_id", "shipment_id"),
        {"comment": "Per-document upload records. Schema-ready; not yet populated by the pipeline."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    classification: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Path within the Supabase Storage bucket (see app/services/storage_service.py)
    # — null if storage retention isn't configured (SUPABASE_SERVICE_ROLE_KEY
    # unset) or the individual upload failed; never blocks processing either way.
    storage_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExtractedSupplyChain(Base):
    """AI-extracted supply-chain data for a document (schema-ready; see module docstring)."""

    __tablename__ = "extracted_supply_chain"
    __table_args__ = (
        Index("ix_extracted_supply_chain_organization_id", "organization_id"),
        Index("ix_extracted_supply_chain_shipment_id", "shipment_id"),
        {
            "comment": (
                "AI-extracted farmer/GPS/weight data per document. Schema-ready; "
                "not yet populated by the pipeline (see RawDocument's docstring)."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_documents.id", ondelete="SET NULL"), nullable=True
    )
    farmer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gps_coordinates: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
