"""
Notification creation — in-app (always) and email (opt-in per event
type, per organization — see app/models/notification_preference.py).

Same reliability posture as audit logging and webhook dispatch: creating
a notification, or sending its email, is best-effort and must never
fail or slow down the action that triggered it (a shipment completing,
a plan changing, etc).
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger
from app.services.email_service import EmailService

logger = get_logger(__name__)

# Maps a notification's `type` to the notification_preferences column
# that controls whether it also sends an email. Deliberately only
# covers the event types this codebase actually fires a notification
# for today — see that model's docstring for why shipment_failed,
# quota_warning, and webhook_failed aren't included yet.
_EMAIL_PREFERENCE_COLUMN: dict[str, str] = {
    "shipment_completed": "email_on_shipment_completed",
    "team_member_added": "email_on_team_member_added",
    "team_member_removed": "email_on_team_member_removed",
    "plan_changed": "email_on_plan_changed",
}


class NotificationService:
    def __init__(
        self,
        db_session_factory: async_sessionmaker[AsyncSession],
        email_service: EmailService | None = None,
    ) -> None:
        self._db_session_factory = db_session_factory
        self._email_service = email_service

    async def notify(
        self,
        *,
        organization_id: str,
        acting_user_id: str,
        notif_type: str,
        title: str,
        body: str,
        link: str | None = None,
        user_id: str | None = None,
    ) -> None:
        """
        Creates the in-app notification (always happens, unconditional
        on preferences — those only control email) and, if the
        organization has opted into email for this event type, sends it
        to every member of the organization. `acting_user_id` is only
        used to set the RLS session context for the write (same "borrow
        a real member's identity to satisfy get_user_organization_id()"
        pattern used everywhere else in this codebase that writes
        outside an HTTP request's own session) — it is NOT who the
        notification is *for*; that's `user_id` (None = whole
        organization).
        """
        claims = json.dumps({"sub": acting_user_id, "organization_id": organization_id, "role": "authenticated"})
        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"), {"claims": claims}
                    )
                    await session.execute(
                        text(
                            "INSERT INTO notifications "
                            "(id, organization_id, user_id, type, title, body, link, created_at) "
                            "VALUES (:id, :organization_id, :user_id, :type, :title, :body, :link, now())"
                        ),
                        {
                            "id": str(uuid.uuid4()),
                            "organization_id": organization_id,
                            "user_id": user_id,
                            "type": notif_type,
                            "title": title,
                            "body": body,
                            "link": link,
                        },
                    )
        except Exception as exc:  # noqa: BLE001 - must never break the action that triggered this
            logger.error("Failed to create notification (org=%s, type=%s): %s", organization_id, notif_type, exc)
            return

        await self._maybe_send_email(organization_id=organization_id, notif_type=notif_type, title=title, body=body)

    async def _maybe_send_email(self, *, organization_id: str, notif_type: str, title: str, body: str) -> None:
        if not self._email_service or not self._email_service.enabled:
            return
        if notif_type not in _EMAIL_PREFERENCE_COLUMN:
            return

        try:
            async with self._db_session_factory() as session:
                pref_result = await session.execute(
                    text("SELECT get_notification_email_preference(:org_id, :notif_type)"),
                    {"org_id": organization_id, "notif_type": notif_type},
                )
                if not pref_result.scalar_one():
                    return

                members_result = await session.execute(
                    text("SELECT email FROM get_organization_member_emails(:org_id)"), {"org_id": organization_id}
                )
                emails = [row.email for row in members_result if row.email]
        except Exception as exc:  # noqa: BLE001 - email is best-effort, never breaks the triggering action
            logger.error("Failed to resolve email preferences/recipients for org %s: %s", organization_id, exc)
            return

        html = f"<p>{body}</p><p style='color:#6b7280;font-size:12px;'>CanoryAI notification</p>"
        for email in emails:
            await self._email_service.send(to=email, subject=title, html=html)
