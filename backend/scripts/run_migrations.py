"""
Startup migration runner — `python scripts/run_migrations.py`, invoked by
the Dockerfile before uvicorn starts.

Exists because plain `alembic upgrade head` breaks on databases that
predate Alembic tracking. This project's production database was first
populated by running the schema directly (before the Dockerfile ran
migrations at all), so its tables exist but the `alembic_version`
bookkeeping table does not. Against such a database, `upgrade head`
starts from the very first migration and immediately fails with
`DuplicateTableError: relation "audit_log" already exists`.

Decision table:

  alembic_version exists          -> normal `alembic upgrade head`
  no alembic_version, no tables   -> fresh database: `alembic upgrade head`
  no alembic_version, tables exist-> legacy database: `alembic stamp
                                     <PREVIOUS_HEAD>` (mark everything up
                                     to the last pre-tracking migration as
                                     already applied, without running it),
                                     then `alembic upgrade head` to apply
                                     only what's genuinely new.

PREVIOUS_HEAD must be bumped whenever a new migration lands *and* there
are still untracked production databases in the wild — it should always
name the last revision whose schema those databases already contain. Once
every environment has an `alembic_version` table (i.e. after this script
has run everywhere once), the stamp branch is dead code and PREVIOUS_HEAD
no longer needs maintaining.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.config import get_settings  # noqa: E402

# The last migration already present in databases created before Alembic
# tracking was introduced (the down_revision of the first migration added
# after tracking began — see module docstring).
PREVIOUS_HEAD = "ef3b8ca731b6"

# A table from the very first migration — its presence distinguishes a
# legacy (pre-tracking) database from a genuinely fresh one.
SENTINEL_TABLE = "audit_log"


async def inspect_database() -> tuple[bool, bool]:
    """Return (alembic_version_exists, sentinel_table_exists)."""
    engine = create_async_engine(get_settings().DATABASE_URL)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT "
                    "  to_regclass('public.alembic_version') IS NOT NULL AS has_version, "
                    f"  to_regclass('public.{SENTINEL_TABLE}') IS NOT NULL AS has_sentinel"
                )
            )
            row = result.one()
            return bool(row.has_version), bool(row.has_sentinel)
    finally:
        await engine.dispose()


def run_alembic(*args: str) -> None:
    print(f"[migrations] alembic {' '.join(args)}", flush=True)
    subprocess.run(["alembic", *args], check=True)


def main() -> None:
    has_version, has_sentinel = asyncio.run(inspect_database())

    if not has_version and has_sentinel:
        print(
            "[migrations] Database has tables but no alembic_version — "
            f"stamping at {PREVIOUS_HEAD} before upgrading.",
            flush=True,
        )
        run_alembic("stamp", PREVIOUS_HEAD)

    run_alembic("upgrade", "head")
    print("[migrations] Database is up to date.", flush=True)


if __name__ == "__main__":
    main()
