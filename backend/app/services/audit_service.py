"""
Audit Vault write service.

`AuditService.log_event` is the *only* sanctioned way to write to
`audit_log` anywhere in the codebase — see `app/models/audit_log.py` for
why that table must never be updated or deleted from. This service is
intentionally resilient: a failure here (bad connection, serialization
error, constraint violation) is logged and swallowed, never propagated,
because losing one audit record must never take down the compliance
pipeline that record was describing.

As of Phase 6, every write is also organization-scoped and goes through
the same RLS mechanism as any other request (see `app/core/auth.py`) —
`log_event` sets `request.jwt.claims` on its own session before inserting,
using the *acting user's* identity for RLS purposes even when the audit
row's `actor` column says something else (e.g. "CanoryAI"). Those are
different concepts: `actor` is the human-readable "who/what did this" for
display, while the RLS claim answers "on whose authority is this INSERT
happening" — the authenticated end-user whose request triggered the
pipeline that's now logging a system event.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger
from app.models.audit_log import AuditLog

logger = get_logger(__name__)

# Actors for system-initiated events, kept as constants so every call site
# uses an identical string rather than ad hoc literals.
ACTOR_CANOPY_AI = "CanoryAI"
ACTOR_SYSTEM = "System"


class AuditService:
    """
    Writes immutable audit events. Holds its own session factory rather
    than sharing the request's `AsyncSession` — audit events must survive
    independently of whatever transaction the calling business logic is
    in (a rolled-back compliance check should still leave behind a record
    that it was attempted and failed).
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def log_event(
        self,
        *,
        shipment_id: str | uuid.UUID,
        actor: str,
        action_type: str,
        details: dict[str, Any],
        organization_id: str | uuid.UUID,
        acting_user_id: str | uuid.UUID,
    ) -> None:
        """
        Record a single audit event. Never raises — every failure mode is
        caught, logged at ERROR level, and swallowed so the caller's
        pipeline continues unaffected.

        `organization_id` and `acting_user_id` are required (not
        defaulted) deliberately: every audit event belongs to exactly one
        organization, and there's no safe default to fall back to if a
        call site doesn't know its own tenant context — that's a bug at
        the call site, not something this method should paper over.
        """
        try:
            validated_shipment_id = self._coerce_uuid(shipment_id, "shipment_id")
            validated_org_id = self._coerce_uuid(organization_id, "organization_id")
            validated_user_id = self._coerce_uuid(acting_user_id, "acting_user_id")
        except ValueError as exc:
            logger.error("Audit logging skipped for action %s: %s", action_type, exc)
            return

        if not actor or not actor.strip():
            logger.error(
                "Audit logging skipped: empty actor for shipment %s, action %s.",
                validated_shipment_id,
                action_type,
            )
            return

        if not action_type or not action_type.strip():
            logger.error(
                "Audit logging skipped: empty action_type for shipment %s.", validated_shipment_id
            )
            return

        try:
            # Fail fast on non-JSON-serializable details (e.g. a stray
            # datetime or Decimal slipped in) before ever touching the DB,
            # so the error message points at the real cause.
            json.dumps(details, default=str)
        except (TypeError, ValueError) as exc:
            logger.error(
                "Audit logging skipped: details for shipment %s, action %s are not "
                "JSON-serializable: %s",
                validated_shipment_id,
                action_type,
                exc,
            )
            return

        record = AuditLog(
            shipment_id=validated_shipment_id,
            organization_id=validated_org_id,
            actor=actor.strip(),
            action_type=action_type.strip(),
            details=details,
        )

        claims = json.dumps(
            {"sub": str(validated_user_id), "organization_id": str(validated_org_id), "role": "authenticated"}
        )

        try:
            async with self._session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"),
                        {"claims": claims},
                    )
                    session.add(record)
        except SQLAlchemyError as exc:
            logger.error(
                "Audit logging FAILED (database error) for shipment %s, action %s: %s",
                validated_shipment_id,
                action_type,
                exc,
            )
            return
        except Exception as exc:  # noqa: BLE001 - absolute last resort; must never propagate
            logger.error(
                "Audit logging FAILED (unexpected error) for shipment %s, action %s: %s",
                validated_shipment_id,
                action_type,
                exc,
            )
            return

        logger.info(
            "Audit event recorded: shipment=%s org=%s actor=%s action=%s",
            validated_shipment_id,
            validated_org_id,
            actor,
            action_type,
        )

    @staticmethod
    def _coerce_uuid(value: str | uuid.UUID, field_name: str) -> uuid.UUID:
        if isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(str(value))
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValueError(f"{field_name}={value!r} is not a valid UUID") from exc
