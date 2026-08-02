"""
CustomsTree Phase 1 application entrypoint.

Wires together configuration, logging, the shared HTTP client lifecycle,
API routers, and global exception handlers. Run with:

    uvicorn main:app --reload
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.shipments import router as shipments_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.audit import router as audit_router
from app.api.v1.api_keys import router as api_keys_router
from app.api.v1.webhooks import router as webhooks_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.auth_public import router as auth_public_router
from app.api.v1.contact import router as contact_router
import app.models  # noqa: F401 - registers every ORM model on Base.metadata; see that package's docstring
from app.core.config import get_settings
from app.core.exceptions import (
    CustomsTreeError,
    customstree_exception_handler,
    unhandled_exception_handler,
)
from app.core.logging import configure_logging, get_logger
from app.db.base import create_engine_and_sessionmaker
from app.services.job_worker import JobWorker
from app.services.shipment_store import InMemoryShipmentStore

settings = get_settings()
configure_logging(settings.LOG_LEVEL)
logger = get_logger(__name__)


async def _verify_database_role_cannot_bypass_rls(engine: AsyncEngine) -> None:
    """
    Refuse to start if the database role in `DATABASE_URL` has
    `BYPASSRLS` — a real, shipped incident, not a hypothetical.

    Every tenant-isolation guarantee in this app (every RLS policy, every
    `_verify_shipment_ownership` call, everything `app/core/auth.py`'s
    module docstring documents about "the database itself won't return
    rows outside the caller's organization no matter what SQL the app
    issues") depends entirely on the connecting role actually being
    subject to Row Level Security. A role with BYPASSRLS — most commonly
    Supabase's own `postgres` superuser, which is *meant* for their
    dashboard/CLI tooling, not for an application's runtime connection —
    makes every one of those policies pure decoration: Postgres simply
    returns all rows to that role regardless of what any policy says.
    This is exactly what happened here: `DATABASE_URL` was pointed at
    `postgres` instead of the narrowly-scoped `canopyai_app` role the
    migrations already create and grant (see e.g.
    `migrations/versions/6eeaf452502c_create_audit_log_table.py`'s
    docstring), and it silently leaked one organization's shipments to
    another's account with no error anywhere — the queries all "worked",
    they just didn't filter.

    A misconfiguration this severe should never depend on someone
    remembering to run a manual SQL check after the fact. This makes it
    impossible to deploy by mistake: the app fails loudly at boot, before
    serving a single request, with a message that says exactly what's
    wrong and how to fix it.
    """
    async with engine.connect() as conn:
        result = await conn.execute(
            text("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
        )
        row = result.first()

    if row is None:
        # Extremely unlikely (current_user always resolves to a real
        # role), but fail closed rather than silently proceeding if it
        # somehow does.
        raise RuntimeError(
            "Could not verify the database role's RLS status at startup (no matching pg_roles row "
            "for current_user). Refusing to start — this check exists specifically to prevent a "
            "silent cross-tenant data leak; see _verify_database_role_cannot_bypass_rls's docstring."
        )

    if row.rolbypassrls or row.rolsuper:
        raise RuntimeError(
            f"\n\n"
            f"FATAL: DATABASE_URL connects as role '{row.rolname}', which has "
            f"{'BYPASSRLS' if row.rolbypassrls else ''}{' and ' if row.rolbypassrls and row.rolsuper else ''}"
            f"{'SUPERUSER' if row.rolsuper else ''} — Postgres Row Level Security is completely "
            f"bypassed for every query this app makes, regardless of how correct the RLS policies "
            f"are. This is a critical, silent cross-tenant data leak: any organization's data is "
            f"visible to any other organization.\n\n"
            f"Fix: point DATABASE_URL at the narrowly-scoped 'canopyai_app' role instead (it already "
            f"exists — every migration grants it exactly the privileges it needs; see "
            f"migrations/versions/6eeaf452502c_create_audit_log_table.py for how it's provisioned). "
            f"Keep the same host/port/database — only the username (and its password) change. Do "
            f"NOT attempt to fix this by revoking BYPASSRLS from '{row.rolname}' itself if it's "
            f"Supabase's own 'postgres' role — that role is used by Supabase's own dashboard and "
            f"tooling and is expected to have elevated privileges; the fix is to stop using it for "
            f"this application's own runtime connection, not to weaken it.\n"
        )

    logger.info("Database role '%s' verified: RLS is enforced (no BYPASSRLS, no SUPERUSER).", row.rolname)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Manage the shared HTTP client, database engine, in-memory shipment
    store, and priority processing queue's background worker lifecycles.
    """
    logger.info("Starting %s (env=%s).", settings.APP_NAME, settings.APP_ENV)
    # `follow_redirects=True` matters here: httpx defaults to NOT following
    # redirects, and this single client is shared by every outbound call
    # (GFW, Groq, Gemini, webhooks). Global Forest Watch's Data API
    # redirects (HTTP 307) on some query paths — without this, that 307
    # was returned as-is to callers and surfaced as a raw, confusing
    # "Global Forest Watch returned HTTP 307" error instead of the actual
    # query result.
    app.state.http_client = httpx.AsyncClient(follow_redirects=True)
    app.state.shipment_store = InMemoryShipmentStore()

    engine, session_factory = create_engine_and_sessionmaker(settings)
    app.state.db_engine = engine
    app.state.db_session_factory = session_factory

    await _verify_database_role_cannot_bypass_rls(engine)

    # JobWorker needs its own long-lived ShipmentProcessingService
    # instance — distinct from the one built per-request in
    # app/api/v1/dependencies.py, since the worker isn't running inside
    # any HTTP request at all. Built directly here rather than through
    # FastAPI's `Depends()` system, which only resolves within a request.
    from app.api.v1.dependencies import _build_shipment_processing_service

    processing_service = _build_shipment_processing_service(
        settings=settings, http_client=app.state.http_client, shipment_store=app.state.shipment_store,
        db_session_factory=session_factory,
    )
    job_worker = JobWorker(db_session_factory=session_factory, processing_service=processing_service)
    job_worker.start()
    app.state.job_worker = job_worker

    try:
        yield
    finally:
        await job_worker.stop()
        await app.state.http_client.aclose()
        await app.state.db_engine.dispose()
        logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    """Application factory — keeps module import side-effects minimal and testable."""
    application = FastAPI(
        title=settings.APP_NAME,
        description=(
            "AI-powered EUDR supply chain compliance platform — document "
            "ingestion, satellite/mass-balance compliance verification, and "
            "EUDR Due Diligence Statement (DDS) XML generation for TRACES NT."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    application.include_router(shipments_router, prefix=settings.API_V1_PREFIX)
    application.include_router(organizations_router, prefix=settings.API_V1_PREFIX)
    application.include_router(audit_router, prefix=settings.API_V1_PREFIX)
    application.include_router(api_keys_router, prefix=settings.API_V1_PREFIX)
    application.include_router(webhooks_router, prefix=settings.API_V1_PREFIX)
    application.include_router(notifications_router, prefix=settings.API_V1_PREFIX)
    application.include_router(auth_public_router, prefix=settings.API_V1_PREFIX)
    application.include_router(contact_router, prefix=settings.API_V1_PREFIX)

    # --- Security middleware (order matters: Starlette applies these
    # outside-in for requests, so the last one added runs first) ---

    # 1. Trusted Host: reject requests with a forged/unexpected Host header
    # before anything else touches them. "*" (the local-dev default)
    # disables this check for platforms that already validate the host at
    # their edge — see Settings.ALLOWED_HOSTS's docstring.
    application.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

    # 2. CORS: allow only explicitly configured frontend origins to call
    # this API from a browser. NEVER allow_origins=["*"] here — that would
    # let any website's JavaScript read authenticated responses from this
    # API on a logged-in user's behalf. FRONTEND_URL supports a
    # comma-separated list so the same image can serve a production
    # frontend and a staging/preview frontend without a code change — see
    # Settings.FRONTEND_URL and DEPLOYMENT.md for the full explanation.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 3. GZip: compress JSON/XML responses over ~1KB (the DDS XML export
    # and audit trail responses both benefit meaningfully from this).
    application.add_middleware(GZipMiddleware, minimum_size=1024)

    application.add_exception_handler(CustomsTreeError, customstree_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    @application.get("/health", tags=["System"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok", "service": settings.APP_NAME}

    return application


app = create_app()
