"""
UserRole ORM model — links a Supabase-authenticated user to an
organization with a specific role.

This is the single source of truth `get_current_user()` (see
`app/core/auth.py`) queries to resolve "which organization is this JWT's
user allowed to act as, and with what permissions". `user_id` references
`auth.users(id)`, the table Supabase Auth (or the local dev stub — see
`scripts/local_dev_auth_stub.sql`) provisions automatically.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Kept as plain strings (not a Postgres ENUM) so adding a new role tier
# later is a data change, not a schema migration. Enforced at the database
# level via CHECK constraint below, and at the application level via
# `OrganizationRole` in app/schemas/auth.py — keep both in sync.
VALID_ROLES = ("owner", "admin", "compliance_manager", "viewer")


class UserRole(Base):
    """A single (user, organization, role) membership record."""

    __tablename__ = "user_roles"
    __table_args__ = (
        CheckConstraint(f"role IN {VALID_ROLES}", name="ck_user_roles_valid_role"),
        UniqueConstraint("user_id", "organization_id", name="uq_user_roles_user_org"),
        Index("ix_user_roles_organization_id", "organization_id"),
        Index("ix_user_roles_user_id", "user_id"),
        {"comment": "Maps Supabase-authenticated users to organizations with a role."},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"UserRole(user_id={self.user_id!r}, organization_id={self.organization_id!r}, "
            f"role={self.role!r})"
        )
