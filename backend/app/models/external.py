"""
References to tables CanoryAI does not own or manage.

`auth.users` is provisioned automatically by Supabase Auth (or by
`scripts/local_dev_auth_stub.sql` for local development) — it is never
created, altered, or dropped by our own Alembic migrations. This module
declares just enough of its shape (a bare `id` column) for SQLAlchemy to
resolve foreign keys like `UserRole.user_id` against it. See
`migrations/env.py`'s `include_object` filter, which excludes this table
from autogenerate diffing so Alembic never tries to manage it.
"""

from __future__ import annotations

from sqlalchemy import Column, Table
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base

# Deliberately a plain Table (not a Base-mapped class) on the same
# metadata, extend_existing so re-importing this module is idempotent.
auth_users_table = Table(
    "users",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    schema="auth",
    extend_existing=True,
)
