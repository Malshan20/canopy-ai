"""
Dependency providers for the v1 API layer.

Centralizes how FastAPI resolves settings, the shared HTTP client, database
session factory, authenticated user context, and fully-wired service
instances for route handlers. Routes should never construct services
directly — they depend on these providers instead.
"""

from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.auth import CurrentUser, get_current_user, get_rls_session, AuthenticatedIdentity, get_authenticated_identity
from app.core.config import Settings, get_settings
from app.db.base import get_db_session_factory
from app.services.audit_service import AuditService
from app.services.document_review_service import DocumentReviewService
from app.services.file_scanner import FileScanner
from app.services.gemini_extractor import GeminiExtractor
from app.services.geospatial_service import GeospatialService
from app.services.groq_classifier import GroqClassifier
from app.services.shipment_processor import ShipmentProcessingService
from app.services.shipment_store import InMemoryShipmentStore
from app.services.email_service import EmailService
from app.services.notification_service import NotificationService
from app.services.storage_service import StorageService
from app.services.supabase_admin_service import SupabaseAdminService
from app.services.webhook_service import WebhookService
from app.services.zip_service import ZipService


def get_http_client(request: Request) -> httpx.AsyncClient:
    """Return the single shared AsyncClient created at application startup."""
    return request.app.state.http_client


def get_shipment_store(request: Request) -> InMemoryShipmentStore:
    """Return the single shared in-memory shipment store created at application startup."""
    return request.app.state.shipment_store


SettingsDep = Annotated[Settings, Depends(get_settings)]
HttpClientDep = Annotated[httpx.AsyncClient, Depends(get_http_client)]
ShipmentStoreDep = Annotated[InMemoryShipmentStore, Depends(get_shipment_store)]
DbSessionFactoryDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_db_session_factory)]

# --- Authentication (see app/core/auth.py for the zero-trust chain this implements) ---
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
RlsSessionDep = Annotated[AsyncSession, Depends(get_rls_session)]
AuthenticatedIdentityDep = Annotated[AuthenticatedIdentity, Depends(get_authenticated_identity)]


def get_audit_service(session_factory: DbSessionFactoryDep) -> AuditService:
    """Construct an AuditService for a single request."""
    return AuditService(session_factory)


AuditServiceDep = Annotated[AuditService, Depends(get_audit_service)]


def get_email_service(settings: SettingsDep, http_client: HttpClientDep) -> EmailService:
    return EmailService(settings, http_client)


EmailServiceDep = Annotated[EmailService, Depends(get_email_service)]


def get_notification_service(db_session_factory: DbSessionFactoryDep, email_service: EmailServiceDep) -> NotificationService:
    return NotificationService(db_session_factory, email_service)


NotificationServiceDep = Annotated[NotificationService, Depends(get_notification_service)]


def get_supabase_admin_service(settings: SettingsDep, http_client: HttpClientDep) -> SupabaseAdminService:
    return SupabaseAdminService(settings, http_client)


SupabaseAdminServiceDep = Annotated[SupabaseAdminService, Depends(get_supabase_admin_service)]


def _build_shipment_processing_service(
    *,
    settings: Settings,
    http_client: httpx.AsyncClient,
    shipment_store: InMemoryShipmentStore,
    db_session_factory: async_sessionmaker[AsyncSession],
) -> ShipmentProcessingService:
    """
    The actual construction logic, factored out so it can be called two
    ways: per-request, via `get_shipment_processing_service` below
    (FastAPI's `Depends()` system, which only resolves within a request);
    and once at startup for `JobWorker`'s long-lived instance (see
    `main.py`'s lifespan), which isn't running inside any HTTP request at
    all and so can't use `Depends()`.
    """
    audit_service = AuditService(db_session_factory)
    return ShipmentProcessingService(
        settings=settings,
        zip_service=ZipService(settings),
        file_scanner=FileScanner(settings),
        classifier=GroqClassifier(settings, http_client),
        extractor=GeminiExtractor(settings, http_client),
        geospatial_service=GeospatialService(settings, http_client, audit_service),
        shipment_store=shipment_store,
        audit_service=audit_service,
        db_session_factory=db_session_factory,
        storage_service=StorageService(settings, http_client),
        webhook_service=WebhookService(http_client, db_session_factory),
        notification_service=NotificationService(db_session_factory, EmailService(settings, http_client)),
    )


def get_shipment_processing_service(
    settings: SettingsDep,
    http_client: HttpClientDep,
    shipment_store: ShipmentStoreDep,
    db_session_factory: DbSessionFactoryDep,
) -> ShipmentProcessingService:
    """Construct a fully-wired ShipmentProcessingService for a single request."""
    return _build_shipment_processing_service(
        settings=settings,
        http_client=http_client,
        shipment_store=shipment_store,
        db_session_factory=db_session_factory,
    )


ShipmentServiceDep = Annotated[ShipmentProcessingService, Depends(get_shipment_processing_service)]


def get_geospatial_service(
    settings: SettingsDep, http_client: HttpClientDep, audit_service: AuditServiceDep
) -> GeospatialService:
    """Construct a GeospatialService for a single request — the same GFW
    client the ingestion pipeline uses, reused here for on-demand
    per-document re-verification (see `document_review.py`'s routes)."""
    return GeospatialService(settings, http_client, audit_service)


GeospatialServiceDep = Annotated[GeospatialService, Depends(get_geospatial_service)]


def get_document_review_service(
    shipment_store: ShipmentStoreDep,
    geospatial_service: GeospatialServiceDep,
    audit_service: AuditServiceDep,
    db_session_factory: DbSessionFactoryDep,
) -> DocumentReviewService:
    """Construct a DocumentReviewService for a single request."""
    return DocumentReviewService(
        shipment_store=shipment_store,
        geospatial_service=geospatial_service,
        audit_service=audit_service,
        db_session_factory=db_session_factory,
    )


DocumentReviewServiceDep = Annotated[DocumentReviewService, Depends(get_document_review_service)]
