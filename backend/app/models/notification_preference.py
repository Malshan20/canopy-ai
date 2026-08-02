"""
Per-organization notification preferences — whether each event type
ALSO sends an email, on top of the in-app notification it always
creates (see app/models/notification.py). One row per organization,
managed by owner/admin, matching how plan management works.

Deliberately scoped to only the event types this codebase actually
fires a notification for today (see
app/services/notification_service.py's call sites) — shipment_failed,
quota_warning, and webhook_failed exist as valid `notifications.type`
values but nothing triggers them yet, so no preference toggle is
offered for them; adding one would imply a working feature that isn't
there.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (
        {
            "comment": (
                "One row per organization. Controls whether each event type "
                "ALSO sends an email (via Resend) on top of the in-app "
                "notification, which always fires regardless of these settings."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    email_on_shipment_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    email_on_team_member_added: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    email_on_team_member_removed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    email_on_plan_changed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
