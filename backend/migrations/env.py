"""
Alembic migration environment.

Wired to the application's own `Settings` (so `DATABASE_URL` is read from
the same `.env` the app uses — never duplicated in `alembic.ini`) and runs
migrations through an async engine, matching the app's async-only database
access pattern.
"""

import asyncio
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Make `app` importable when Alembic is invoked from the backend/ directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.api_key import ApiKey  # noqa: E402,F401
from app.models.audit_log import AuditLog  # noqa: E402,F401 - registers the model on Base.metadata
from app.models.external import auth_users_table  # noqa: E402,F401 - unmanaged, see module docstring
from app.models.contact_ticket import ContactTicket, ContactTicketMessage  # noqa: E402,F401
from app.models.notification import Notification  # noqa: E402,F401
from app.models.notification_preference import NotificationPreference  # noqa: E402,F401
from app.models.organization import Organization  # noqa: E402,F401
from app.models.shipment_approval import ShipmentApproval  # noqa: E402,F401
from app.models.processing_job import ProcessingJob  # noqa: E402,F401
from app.models.raw_document import ExtractedSupplyChain, RawDocument  # noqa: E402,F401
from app.models.shipment import Shipment  # noqa: E402,F401
from app.models.user_role import UserRole  # noqa: E402,F401
from app.models.webhook import Webhook  # noqa: E402,F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Never let Alembic manage `auth.users` — Supabase (or the local dev
    stub) owns that table's lifecycle, not our migrations."""
    if type_ == "table" and name == "users" and getattr(object, "schema", None) == "auth":
        return False
    return True


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live DB connection (`alembic upgrade head --sql`)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, include_object=include_object)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations against a live database using an async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
