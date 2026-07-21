"""
ApiKey ORM model.

Backs programmatic (non-browser) access to the CanoryAI API — the
"API access" feature sold on the Enterprise and Custom pricing tiers.
Deliberately separate from Supabase Auth/JWTs: an API key is a long-lived
credential meant for server-to-server calls (a customer's ERP, a cron
job), not a human session.

Security shape, read this before touching this table:
  - The plaintext key is NEVER stored, and is shown to the user exactly
    once, at creation time (see `app/api/v1/api_keys.py`). Only a SHA-256
    hash of it (`key_hash`) is persisted — the same reasoning as storing
    a password hash, not a password.
  - `key_prefix` stores just the first several characters of the plaintext
    key (e.g. `cnry_live_a1b2c3d4`) purely so a user can tell their keys
    apart in a list without CanoryAI ever being able to show them the
    full key again.
  - `created_by` is NOT NULL by design: every key's effective permissions
    are resolved by re-checking *that user's current* organization
    membership and role on every request (see
    `app/core/auth.py::_authenticate_api_key`), not a role frozen onto
    the key at creation time. This means revoking or demoting the
    creating user immediately and automatically weakens or disables every
    key they created — a deliberate security property, not an edge case
    to work around.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class ApiKey(Base):
    """A hashed, revocable API credential scoped to one organization."""

    __tablename__ = "api_keys"
    __table_args__ = (
        Index("ix_api_keys_organization_id", "organization_id"),
        Index("ix_api_keys_key_hash", "key_hash", unique=True),
        {
            "comment": (
                "Programmatic API credentials. Only a SHA-256 hash of the real key "
                "is ever stored — see this model's module docstring."
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
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # hex-encoded SHA-256, always 64 chars
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"ApiKey(id={self.id!r}, organization_id={self.organization_id!r}, name={self.name!r})"
