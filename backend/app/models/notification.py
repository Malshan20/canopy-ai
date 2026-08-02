"""
Notification ORM model — real in-app notifications, the piece of
"no notification system" that's genuinely buildable without any external
dependency (unlike email, which needs a real transactional email
provider — see app/services/email_service.py).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

VALID_NOTIFICATION_TYPES = (
    "shipment_completed",
    "shipment_failed",
    "team_member_added",
    "team_member_removed",
    "plan_changed",
    "quota_warning",
    "webhook_failed",
)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(f"type IN {VALID_NOTIFICATION_TYPES}", name="ck_notifications_valid_type"),
        Index("ix_notifications_organization_id", "organization_id"),
        # The exact shape the unread-count and list queries filter on —
        # without this, both degrade to a full-table scan per request.
        Index("ix_notifications_recipient_unread", "organization_id", "user_id", "read_at"),
        {
            "comment": (
                "In-app notifications. user_id NULL means 'visible to every "
                "member of the organization' (e.g. a plan change); a specific "
                "user_id means it's for them alone."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
