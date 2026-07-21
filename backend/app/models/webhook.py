"""
Webhook ORM model.

The honest, buildable version of "ERP integrations" — see the pricing
page audit this replaces: a real SAP connector and a real NetSuite
connector are different projects, not one feature. What's actually
buildable and genuinely useful for *any* downstream system is a signed
webhook fired when a shipment finishes processing — the customer's own
middleware (which could itself be the actual ERP connector, built by
them or a systems integrator) receives it and does whatever integration
work is specific to their system. This is the connective piece CanoryAI
can honestly claim, not a specific vendor integration it hasn't built.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


def generate_webhook_secret() -> str:
    """A per-webhook HMAC signing secret, generated once at creation."""
    return secrets.token_urlsafe(32)


class Webhook(Base):
    __tablename__ = "webhooks"
    __table_args__ = (
        Index("ix_webhooks_organization_id", "organization_id"),
        {
            "comment": (
                "Customer-configured HTTP endpoints notified when a shipment "
                "finishes processing. Payloads are HMAC-SHA256 signed with "
                "each webhook's own secret."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    # Shown to the customer once at creation, same as an API key — used to
    # verify X-CanoryAI-Signature on their receiving end.
    secret: Mapped[str] = mapped_column(String(64), nullable=False, default=generate_webhook_secret)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
