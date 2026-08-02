"""
AuditLog ORM model — the immutable evidence ledger backing the Audit Vault.

Deliberately kept in its own module rather than `app/models/domain.py`.
`domain.py` is documented as holding lightweight, dependency-free internal
dataclasses used purely within the processing pipeline (see its own
docstring); this model is a SQLAlchemy-mapped, database-backed persistence
class with a fundamentally different lifecycle and a much stronger
correctness requirement (once written, a row must never change). Keeping
it separate means nothing importing `domain.py`'s pipeline dataclasses
pulls in SQLAlchemy as a transitive dependency, and this file can carry
its own, much stricter set of invariants without diluting `domain.py`'s.

--------------------------------------------------------------------------
APPEND-ONLY: THIS TABLE MUST NEVER BE UPDATED OR DELETED FROM.
--------------------------------------------------------------------------
Under EUDR due-diligence requirements, `audit_log` is CanoryAI's permanent,
chronological, legally defensible record of every compliance-relevant
action. It must behave like a legal evidence ledger:

  * Application code MUST only ever INSERT rows (see `app/services/audit_service.py`,
    the only writer). No service, route, or admin tool should ever call
    `session.execute(update(AuditLog)...)`, `session.delete(...)`, or
    similar against this model.
  * The database itself enforces this independently of the application —
    see the migration in `migrations/versions/` for:
      1. A `BEFORE UPDATE OR DELETE` trigger that raises an exception,
         active regardless of which role or application performs the
         write.
      2. `REVOKE UPDATE, DELETE, TRUNCATE` from the application's runtime
         database role, so even a compromised or buggy app process is
         denied at the permissions layer — the trigger is defense in
         depth, not the only line of defense.
    See that migration file for the full production role/permissions
    guidance (a separate, tightly-held migration role is the only one
    that should ever be able to alter this table's schema).

--------------------------------------------------------------------------
TENANT ISOLATION (Phase 6): organization_id + Row Level Security
--------------------------------------------------------------------------
As of the multi-tenancy migration, every row also carries `organization_id`
and RLS is enabled on this table: a policy permits SELECT/INSERT only where
`organization_id = get_user_organization_id()`. No UPDATE/DELETE policies
exist at all (not "policies that always deny" — simply none), which
combines with this table's append-only trigger/grants for two independent
reasons the same operation is rejected. See
`migrations/versions/..._add_multi_tenancy.py`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AuditLog(Base):
    """
    A single, immutable compliance audit event.

    One row is written per significant compliance action (document
    extraction, satellite verification, mass balance evaluation, DDS XML
    generation, manual overrides, etc.) — see
    `app/services/audit_service.py` for the exhaustive list of
    `action_type` values currently in use.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_shipment_id_timestamp", "shipment_id", "timestamp"),
        Index("ix_audit_log_organization_id", "organization_id"),
        {
            "comment": (
                "APPEND-ONLY legal evidence ledger for EUDR compliance actions. "
                "INSERT only — never UPDATE or DELETE. Enforced by a database "
                "trigger and role permissions; see the audit_log migration."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Unique audit event identifier.",
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        comment="The tenant this event belongs to. Enforced by RLS — see the multi-tenancy migration.",
    )

    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        comment=(
            "Links this event to a shipment. Not a foreign key to `shipments.id` "
            "for historical reasons (this column predates the shipments table); "
            "tenant isolation for this table is enforced via organization_id "
            "directly, not via a join, so this remains safe."
        ),
    )

    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="UTC timestamp of when this event was recorded, set by the database.",
    )

    actor: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment='Who/what caused this event, e.g. "CanoryAI", "System", or a user identifier.',
    )

    action_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment=(
            "Event category, e.g. DOCUMENT_EXTRACTED, SATELLITE_CHECK_COMPLETED, "
            "SATELLITE_CHECK_FAILED, MASS_BALANCE_PASSED, MASS_BALANCE_FAILED, "
            "MANUAL_OVERRIDE, XML_GENERATED. See app/schemas/audit.py for the "
            "canonical set."
        ),
    )

    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
        comment="Complete event metadata as JSON — confidence scores, coordinates, field diffs, etc.",
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid only
        return (
            f"AuditLog(id={self.id!r}, shipment_id={self.shipment_id!r}, "
            f"action_type={self.action_type!r}, actor={self.actor!r})"
        )
