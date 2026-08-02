"""
SQLAlchemy async engine and session factory setup.

This is the only module that constructs the database engine. Everything
else (services, dependencies) receives an `AsyncSession` through dependency
injection — nothing outside this module and `app/api/v1/dependencies.py`
should import `create_async_engine` or hold a reference to the engine
directly.
"""

from __future__ import annotations

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import Settings


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models in the application."""


def create_engine_and_sessionmaker(
    settings: Settings,
) -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """
    Build the async engine and session factory once at application startup.

    Called from `main.py`'s lifespan; the returned engine and session
    factory are stored on `app.state` and disposed/closed on shutdown.

    `connect_args` here are specifically for connecting through Supabase's
    Supavisor pooler (see the long comment on `Settings.DATABASE_URL` for
    why the pooler, not the direct connection, is required at all on most
    hosting platforms):
      - `ssl="require"`: the pooler requires TLS and doesn't negotiate it
        automatically the way a direct Postgres connection can — asyncpg
        needs this told to it explicitly, or the connection attempt fails
        before authentication is even reached.
      - `statement_cache_size=0`: disables asyncpg's client-side prepared
        statement cache. Harmless and unnecessary against Session-mode
        pooling (the documented, correct mode to use), but disabling it
        costs nothing and prevents a real, sharp-edged failure mode
        ("prepared statement does not exist") if the pooler is ever
        switched to Transaction mode later, intentionally or by mistake.
    """
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        echo=settings.DATABASE_ECHO,
        pool_pre_ping=True,
        connect_args={"ssl": "require", "statement_cache_size": 0},
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    return engine, session_factory


def get_db_session_factory(request: Request) -> async_sessionmaker[AsyncSession]:
    """
    FastAPI dependency: return the shared async session factory created at
    application startup. Defined here (rather than in
    app/api/v1/dependencies.py) so both that module and app/core/auth.py
    can depend on it without a circular import between the two.
    """
    return request.app.state.db_session_factory
