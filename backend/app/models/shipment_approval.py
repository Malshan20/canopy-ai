"""
Records an explicit human sign-off before a shipment's XML can be
exported — see Organization.require_export_approval and
app/api/v1/shipments.py's download_shipment_xml for how this gate is
enforced. One row per (shipment, approval event); a shipment is
considered approved-for-export if at least one row exists for it.

`shipment_id` is a plain UUID with no foreign key, matching how
`audit_log.shipment_id` already works — shipments themselves aren't a
persisted Postgres table (see InMemoryShipmentStore's documented
limitation), so there's nothing to reference.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ShipmentApproval(Base):
    __tablename__ = "shipment_approvals"
    __table_args__ = (
        Index("ix_shipment_approvals_shipment_id", "shipment_id"),
        Index("ix_shipment_approvals_organization_id", "organization_id"),
        {"comment": "Explicit compliance sign-off gating XML export when Organization.require_export_approval is true."},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shipment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    approved_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False
    )
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
