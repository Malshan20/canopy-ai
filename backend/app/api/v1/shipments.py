"""
Shipment ingestion API routes.

Route handlers are intentionally thin: all business logic lives in
`app.services.shipment_processor.ShipmentProcessingService` and friends.
This keeps the HTTP layer focused purely on request/response translation.

Every route in this file requires authentication and is organization-scoped
— see `app/core/auth.py` for the zero-trust chain (JWT verification ->
organization resolution -> RLS-scoped database session) every request goes
through. Ownership checks here always query through the RLS-scoped
session rather than comparing IDs in application code: if a row isn't
visible through that session, it either doesn't exist or belongs to
another organization, and this code deliberately can't tell which (nor
should it — see the 404 responses below).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import (
    AuditServiceDep,
    CurrentUserDep,
    DocumentReviewServiceDep,
    HttpClientDep,
    RlsSessionDep,
    SettingsDep,
    ShipmentServiceDep,
    ShipmentStoreDep,
)
from app.core.exceptions import (
    AuditTrailUnavailableError,
    DdsValidationError,
    ExportApprovalRequiredError,
    InsufficientRoleError,
    InvalidShipmentDataError,
    QuotaExceededError,
    ReviewWorkflowUnavailableError,
    ShipmentNotFoundError,
    XmlGenerationError,
)
from app.core.logging import get_logger
from app.models.audit_log import AuditLog
from app.models.shipment import Shipment
from app.schemas.audit import AuditEventResponse, AuditTrailResponse
from app.schemas.responses import ErrorResponse, ShipmentUploadResponse
from app.schemas.compliance import SatelliteVerificationResult
from app.schemas.shipment_summary import (
    DocumentFlagResponse,
    FlagDocumentRequest,
    GenerateDdsXmlRequest,
    ProcessingJobResponse,
    ShipmentApprovalResponse,
    ShipmentListItem,
    ShipmentListResponse,
    VerifySatelliteRequest,
)
from app.services.audit_service import ACTOR_CANOPY_AI
from app.services.plan_limits import current_billing_year_start, get_job_priority, get_shipment_limit
from app.services.xml_data_builder import build_operator_payload, build_shipment_payload
from app.services.xml_generator import build_dds_element, generate_traces_xml
from app.services.traces_soap_client import submit_dds_to_traces
from app.services.zip_service import ZipService

logger = get_logger(__name__)

router = APIRouter(prefix="/shipments", tags=["Shipments"])

XML_EXPORT_FILENAME = "eudr_dds_export.xml"


@router.get(
    "",
    response_model=ShipmentListResponse,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
    },
    summary="List shipments for the caller's organization, newest first.",
)
async def list_shipments(
    rls_session: RlsSessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> ShipmentListResponse:
    """
    Paginated shipment history for the Shipments list page. Reads through
    `rls_session`, so — like every other route in this file — the
    organization scoping is enforced by PostgreSQL itself: this query has
    no `WHERE organization_id = ...` clause of its own because it doesn't
    need one.

    Several fields (`documents_processed`, `average_confidence`,
    `critical_farms`, `commodity`, `country_of_production`,
    `mass_balance_status`) are `null` for any shipment processed before
    the Phase 8 migration added them, or in the rare case the compliance
    summary couldn't be recorded (see
    `ShipmentProcessingService._record_shipment_ownership`) — never
    fabricated as zero or a placeholder.
    """
    count_result = await rls_session.execute(select(func.count()).select_from(Shipment))
    total = count_result.scalar_one()

    query = (
        select(Shipment)
        .order_by(Shipment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await rls_session.execute(query)
    rows = result.scalars().all()

    return ShipmentListResponse(
        shipments=[ShipmentListItem.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{shipment_id}",
    response_model=ShipmentUploadResponse,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID in your organization."},
    },
    summary="Retrieve a shipment's full result — documents, extraction, and compliance data.",
)
async def get_shipment_detail(
    shipment_id: str,
    rls_session: RlsSessionDep,
    shipment_store: ShipmentStoreDep,
) -> ShipmentUploadResponse:
    """
    The shipment detail page's primary data source.

    SECURITY: ownership is verified through `_verify_shipment_ownership`
    (Postgres RLS) FIRST, unconditionally, before anything else runs.
    This must never be reordered. `InMemoryShipmentStore` is a single
    process-wide dict shared by every organization on this server (see
    its own module docstring) — it has no concept of "whose" a shipment
    is. Checking it before confirming ownership would return a complete
    stranger's shipment (documents, extracted data, everything) to
    anyone who knew or guessed its ID, with zero authorization check.
    That was a real, shipped bug: `get_shipment_detail` used to check the
    cache first and return early on a hit, skipping RLS entirely. Fixed
    by moving the ownership check in front of both the cache and the DB
    fallback, matching the pattern `download_shipment_xml` already used
    correctly.

    After ownership is confirmed, it tries the fast, process-local cache
    first (no JSON parsing, no query), then falls back to reconstructing
    the full result from `shipments.payload` — the durable, RLS-protected
    copy written at upload time (see
    `ShipmentProcessingService._record_shipment_ownership`). That
    fallback is what makes the detail page work regardless of which
    browser session, device, or worker process originally processed the
    shipment; the in-memory store is purely a latency optimization,
    never itself a source of authorization.

    A shipment processed before the payload column existed (or one whose
    write genuinely failed — logged loudly at write time either way) has
    no fallback to reconstruct from either; that case still 404s, same as
    "doesn't exist" or "belongs to another organization" — this endpoint
    deliberately can't and doesn't try to distinguish those.
    """
    await _verify_shipment_ownership(rls_session, shipment_id)

    cached = shipment_store.get(shipment_id)
    if cached is not None:
        return cached

    return await _load_shipment_from_db(rls_session, shipment_store, shipment_id)


async def _load_shipment_from_db(
    rls_session: AsyncSession, shipment_store: InMemoryShipmentStore, shipment_id: str
) -> ShipmentUploadResponse:
    """Reconstruct a shipment's full result from the durable `shipments.payload`
    column when it's not (or no longer) in the fast in-memory cache — the
    same fallback `get_shipment_detail` documents above. Also re-populates
    the in-memory cache on the way out, so a document review action taken
    right after this fallback fires doesn't immediately fall back to the
    database again itself."""
    result = await rls_session.execute(
        text("SELECT payload FROM shipments WHERE id = :id"), {"id": shipment_id}
    )
    row = result.first()
    if row is None or row.payload is None:
        raise ShipmentNotFoundError(
            f"No processed shipment found with ID '{shipment_id}' in your organization, or its "
            "full result was never persisted (see get_shipment_detail's docstring)."
        )

    shipment = ShipmentUploadResponse.model_validate(row.payload)
    shipment_store.save(shipment)
    return shipment


@router.post(
    "/upload-zip",
    response_model=ShipmentUploadResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid, empty, or unsupported upload."},
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        403: {
            "model": ErrorResponse,
            "description": "Not a member of any organization, or the organization's plan shipment limit is reached.",
        },
        413: {"model": ErrorResponse, "description": "Upload exceeds size or file-count limits."},
        422: {"model": ErrorResponse, "description": "Corrupted or unsafe ZIP contents, or invalid GPS data."},
        429: {"model": ErrorResponse, "description": "An upstream AI provider rate limit was hit."},
        502: {"model": ErrorResponse, "description": "An upstream AI provider failed."},
        504: {"model": ErrorResponse, "description": "An upstream AI provider timed out."},
    },
    summary="Upload a shipment ZIP archive for AI-powered compliance document processing.",
)
async def upload_shipment_zip(
    service: ShipmentServiceDep,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    file: UploadFile = File(..., description="A ZIP archive containing supplier documents."),
    total_declared_weight_kg: float = Form(
        ...,
        gt=0,
        description="The shipment's total declared weight in kilograms, used for mass balance validation.",
    ),
) -> ShipmentUploadResponse:
    """
    Accepts a ZIP archive of supplier documents (images and/or PDFs) plus
    the shipment's declared total weight. Safely extracts the archive,
    classifies each document via Groq, runs Gemini vision extraction on
    receipts/deeds, verifies every extracted GPS coordinate against
    satellite deforestation data, validates mass balance against the
    declared weight, and returns a complete compliance report.

    Requires `Authorization: Bearer <supabase_access_token>`. The
    resulting shipment is owned by the caller's organization — see
    `app/models/shipment.py` — and every significant step along the way is
    recorded in the immutable Audit Vault (see `app/services/audit_service.py`).

    Rejects the upload with 403 before any AI processing begins if the
    organization's plan shipment limit for the current calendar year has
    already been reached — see `app/services/plan_limits.py`.
    """
    await _check_shipment_quota(rls_session, current_user.organization_id)

    return await service.process_upload(
        file,
        total_declared_weight_kg,
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
    )


async def _check_shipment_quota(rls_session: AsyncSession, organization_id: str) -> None:
    """
    Rejects the request before any expensive AI processing happens if the
    organization has reached its plan's shipment limit for the current
    calendar year. Both queries here run through `rls_session`, so — same
    as everywhere else in this file — a bug that forgot to scope by
    organization still couldn't leak or miscount another tenant's data.
    """
    plan_result = await rls_session.execute(
        text("SELECT plan FROM organizations WHERE id = :id"), {"id": organization_id}
    )
    plan_row = plan_result.first()
    plan = plan_row.plan if plan_row is not None else "growth"

    limit = get_shipment_limit(plan)
    if limit is None:
        return  # unlimited plan

    count_result = await rls_session.execute(
        text("SELECT count(*) FROM shipments WHERE organization_id = :org_id AND created_at >= :year_start"),
        {"org_id": organization_id, "year_start": current_billing_year_start()},
    )
    current_count = count_result.scalar_one()

    if current_count >= limit:
        raise QuotaExceededError(
            f"Your organization's '{plan}' plan allows {limit} shipments per year, and you've already "
            f"processed {current_count}. Upgrade your plan or contact sales to continue."
        )


@router.post(
    "/upload-zip-async",
    response_model=ProcessingJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid, empty, or unsupported upload."},
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        403: {"model": ErrorResponse, "description": "Not a member of any organization, or plan shipment limit reached."},
        413: {"model": ErrorResponse, "description": "Upload exceeds size or file-count limits."},
    },
    summary="Enqueue a shipment for priority processing. Returns immediately with a job to poll.",
)
async def upload_shipment_zip_async(
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    settings: SettingsDep,
    file: UploadFile = File(..., description="A ZIP archive containing supplier documents."),
    total_declared_weight_kg: float = Form(..., gt=0),
) -> ProcessingJobResponse:
    """
    The priority-queue counterpart to `/upload-zip` — persists the upload
    and enqueues a `processing_jobs` row instead of processing inline.
    `JobWorker` (app/services/job_worker.py) picks it up and runs the
    exact same pipeline (`ShipmentProcessingService.process_from_zip_path`)
    that the synchronous route uses directly. Poll
    `GET /shipments/jobs/{job_id}` for status; once `status` is
    `"completed"`, `shipment_id` is populated and the usual
    `GET /shipments/{shipment_id}` route has the full result.

    Priority is derived once, at enqueue time, from the organization's
    current plan (Enterprise/Custom ahead of Growth — see
    `app/services/plan_limits.py`) — the actual sold meaning of "priority
    processing" on those tiers.
    """
    await _check_shipment_quota(rls_session, current_user.organization_id)

    zip_service = ZipService(settings)
    zip_path = await zip_service.persist_upload(file)

    plan_result = await rls_session.execute(
        text("SELECT plan FROM organizations WHERE id = :id"), {"id": current_user.organization_id}
    )
    plan_row = plan_result.first()
    priority = get_job_priority(plan_row.plan if plan_row is not None else "growth")

    insert_result = await rls_session.execute(
        text(
            "INSERT INTO processing_jobs "
            "(id, organization_id, created_by, priority, status, zip_path, source_filename, declared_weight_kg, created_at) "
            "VALUES (gen_random_uuid(), :organization_id, :created_by, :priority, 'queued', :zip_path, :source_filename, :declared_weight_kg, now()) "
            "RETURNING id, status, shipment_id, error_detail, created_at, started_at, completed_at"
        ),
        {
            "organization_id": current_user.organization_id,
            "created_by": current_user.user_id,
            "priority": priority,
            "zip_path": str(zip_path),
            "source_filename": file.filename or "upload.zip",
            "declared_weight_kg": total_declared_weight_kg,
        },
    )
    job = insert_result.first()

    logger.info(
        "Shipment job enqueued: id=%s org=%s priority=%d file=%s",
        job.id,
        current_user.organization_id,
        priority,
        file.filename,
    )

    return ProcessingJobResponse(
        id=job.id,
        status=job.status,
        shipment_id=job.shipment_id,
        error_detail=job.error_detail,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.get(
    "/jobs/{job_id}",
    response_model=ProcessingJobResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Poll the status of a queued/processing shipment job.",
)
async def get_processing_job(job_id: str, rls_session: RlsSessionDep) -> ProcessingJobResponse:
    result = await rls_session.execute(
        text(
            "SELECT id, status, shipment_id, error_detail, priority, created_at, started_at, completed_at "
            "FROM processing_jobs WHERE id = :id"
        ),
        {"id": job_id},
    )
    job = result.first()
    if job is None:
        raise ShipmentNotFoundError("No such job in your organization.")

    queue_position: int | None = None
    if job.status == "queued":
        position_result = await rls_session.execute(
            text(
                "SELECT count(*) FROM processing_jobs "
                "WHERE status = 'queued' AND (priority > :priority OR (priority = :priority AND created_at < :created_at))"
            ),
            {"priority": job.priority, "created_at": job.created_at},
        )
        # +1: this counts jobs strictly ahead of it across ALL organizations
        # (queue position is a global, cross-tenant concept — the queue
        # itself is shared), so this position is "how many jobs, from any
        # organization, will be claimed before this one".
        queue_position = position_result.scalar_one() + 1

    return ProcessingJobResponse(
        id=job.id,
        status=job.status,
        shipment_id=job.shipment_id,
        error_detail=job.error_detail,
        queue_position=queue_position,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


@router.get(
    "/{shipment_id}/export-approval",
    response_model=ShipmentApprovalResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Check whether this shipment has been approved for XML export.",
)
async def get_shipment_export_approval(
    shipment_id: str, rls_session: RlsSessionDep
) -> ShipmentApprovalResponse:
    await _verify_shipment_ownership(rls_session, shipment_id)

    result = await rls_session.execute(
        text(
            "SELECT approved_by_user_id, approved_at FROM shipment_approvals "
            "WHERE shipment_id = :shipment_id ORDER BY approved_at DESC LIMIT 1"
        ),
        {"shipment_id": shipment_id},
    )
    row = result.first()
    if row is None:
        return ShipmentApprovalResponse(approved=False)
    return ShipmentApprovalResponse(approved=True, approved_by_user_id=row.approved_by_user_id, approved_at=row.approved_at)


@router.post(
    "/{shipment_id}/export-approval",
    response_model=ShipmentApprovalResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners, admins, and compliance managers can approve exports."},
        404: {"model": ErrorResponse},
    },
    summary="Explicitly approve a shipment for XML export — required when the organization has this turned on.",
)
async def approve_shipment_export(
    shipment_id: str, current_user: CurrentUserDep, rls_session: RlsSessionDep, audit_service: AuditServiceDep
) -> ShipmentApprovalResponse:
    """
    Deliberately a *separate*, explicit action from XML download itself —
    the whole point is a real human decision point distinct from "click
    the export button", not something that could be satisfied by the
    same click that triggers the download. Logged to the immutable audit
    vault, same as XML_GENERATED, so there's a permanent record of who
    signed off on this shipment and when.
    """
    if current_user.role not in ("owner", "admin", "compliance_manager"):
        raise InsufficientRoleError(
            "Only owners, admins, and compliance managers can approve a shipment for export."
        )

    await _verify_shipment_ownership(rls_session, shipment_id)

    result = await rls_session.execute(
        text(
            "INSERT INTO shipment_approvals (id, shipment_id, organization_id, approved_by_user_id, approved_at) "
            "VALUES (gen_random_uuid(), :shipment_id, :organization_id, :approved_by_user_id, now()) "
            "RETURNING approved_by_user_id, approved_at"
        ),
        {
            "shipment_id": shipment_id,
            "organization_id": current_user.organization_id,
            "approved_by_user_id": current_user.user_id,
        },
    )
    row = result.first()

    await audit_service.log_event(
        shipment_id=shipment_id,
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        # Deliberately the human's own identity, not ACTOR_CANOPY_AI (the
        # convention XML_GENERATED below uses) — the entire point of this
        # event is recording which specific person made the sign-off
        # decision, not that the system carried out an action a human
        # triggered. `details` also carries approved_by_user_id for
        # machine consumption, but `actor` itself should read like a real
        # audit trail entry: a named person's decision.
        actor=current_user.email or current_user.user_id,
        action_type="EXPORT_APPROVED",
        details={"shipment_id": shipment_id, "approved_by_user_id": current_user.user_id},
    )

    logger.info("Shipment %s approved for export by %s", shipment_id, current_user.user_id)
    return ShipmentApprovalResponse(approved=True, approved_by_user_id=row.approved_by_user_id, approved_at=row.approved_at)


@router.post(
    "/{shipment_id}/xml",
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "content": {"application/xml": {}},
            "description": (
                "A DDS statement document, structurally accurate to the real EUDR TRACES NT schema — "
                "not a submission, and not proof of SOAP-level wire compatibility. See "
                "app/services/xml_generator.py's module docstring for exactly what that does and "
                "doesn't mean; the same explanation is surfaced in-product wherever this is downloaded."
            ),
        },
        400: {"model": ErrorResponse, "description": "Shipment has not passed compliance requirements."},
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID in your organization."},
        422: {
            "model": ErrorResponse,
            "description": (
                "The request body is missing/malformed, or the DDS data can't be produced from it "
                "(e.g. a document's extracted country can't be matched to a real ISO 3166-1 country) "
                "— a real, caller-fixable data issue, not a server error."
            ),
        },
        500: {"model": ErrorResponse, "description": "A genuinely unexpected internal failure while generating the document."},
    },
    summary="Generate a DDS statement document for a shipment (not a TRACES NT submission — see description).",
)
async def download_shipment_xml(
    shipment_id: str,
    body: GenerateDdsXmlRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    shipment_store: ShipmentStoreDep,
    audit_service: AuditServiceDep,
) -> Response:
    """
    Retrieves a previously-processed shipment, verifies it has passed both
    mass balance and satellite compliance checks, and returns a DDS
    statement document structurally accurate to the real EUDR schema — see
    `app/services/xml_generator.py`'s module docstring for the full, honest
    explanation of what "accurate" does and doesn't mean here.

    A POST with a validated body, not a GET with query parameters: the
    real schema needs substantially more fields (operator address/email/
    phone, activity type, country of activity, border-cross country,
    per-plot producer detail) than CanoryAI's Organization model stores
    anywhere, so they're supplied explicitly at export time.

    Ownership is verified through `rls_session` — Postgres itself, not
    application code, decides whether this shipment belongs to the
    caller's organization (see this module's docstring). Only documents
    whose satellite verification came back clean (risk = "low") are
    included as geolocation plots. A shipment that hasn't cleared
    compliance is rejected with 400 rather than producing a misleading
    "negligible risk" statement. On success, an `XML_GENERATED` event is
    recorded in the Audit Vault.
    """
    await _verify_shipment_ownership(rls_session, shipment_id)

    org_result = await rls_session.execute(
        text("SELECT require_export_approval FROM organizations WHERE id = :organization_id"),
        {"organization_id": current_user.organization_id},
    )
    org_row = org_result.first()
    if org_row is not None and org_row.require_export_approval:
        approval_result = await rls_session.execute(
            text("SELECT 1 FROM shipment_approvals WHERE shipment_id = :shipment_id LIMIT 1"),
            {"shipment_id": shipment_id},
        )
        if approval_result.first() is None:
            raise ExportApprovalRequiredError()

    shipment = shipment_store.get(shipment_id)
    if shipment is None:
        # Owned by this organization (per the RLS-verified check above) but
        # the in-memory payload cache has expired or the server restarted
        # — see app/services/shipment_store.py's documented limitation.
        raise ShipmentNotFoundError(
            f"Shipment '{shipment_id}' belongs to your organization but its processed data is no "
            "longer available (the server may have restarted since it was processed)."
        )

    operator_payload = build_operator_payload(body)
    shipment_payload = build_shipment_payload(shipment, body)

    try:
        xml_document = generate_traces_xml(shipment_payload, operator_payload)
    except DdsValidationError as exc:
        # Expected, caller-fixable — not an application error, so not
        # logged as one. INFO-level visibility into how often real
        # shipments hit data-quality issues (an unresolvable country, a
        # missing field) is still useful operationally, just at a
        # different severity than a genuine internal failure.
        logger.info("Shipment %s: DDS validation rejected the request: %s", shipment_id, exc)
        raise
    except XmlGenerationError:
        logger.error("Shipment %s: XML generation failed unexpectedly.", shipment_id)
        raise

    logger.info("Shipment %s: DDS document generated and returned for download.", shipment_id)

    await audit_service.log_event(
        shipment_id=shipment_id,
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        actor=ACTOR_CANOPY_AI,
        action_type="XML_GENERATED",
        details={
            "shipment_id": shipment_id,
            "filename": XML_EXPORT_FILENAME,
            "operator_name": operator_payload["name"],
            "operator_eori": operator_payload.get("eori"),
            "activity_type": shipment_payload["activity_type"],
            "hs_code": shipment_payload["hs_code"],
            "plot_count": len(shipment_payload["plots"]),
            "generated_by_user_id": current_user.user_id,
        },
    )

    return Response(
        content=xml_document,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{XML_EXPORT_FILENAME}"'},
    )


@router.post(
    "/{shipment_id}/submit-to-traces",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "TRACES NT accepted the HTTP request — see this route's own docstring for what that does and doesn't confirm."},
        400: {"model": ErrorResponse, "description": "Shipment has not passed compliance requirements."},
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID in your organization."},
        422: {"model": ErrorResponse, "description": "Invalid or missing required export fields."},
        501: {"model": ErrorResponse, "description": "Real TRACES NT credentials are not configured — see Settings.TRACES_* for how to get them."},
        502: {"model": ErrorResponse, "description": "TRACES NT rejected the submission (a real SOAP Fault)."},
    },
    summary="Submit a shipment's DDS directly to TRACES NT over SOAP — requires real EU credentials.",
)
async def submit_shipment_to_traces(
    shipment_id: str,
    body: GenerateDdsXmlRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    shipment_store: ShipmentStoreDep,
    audit_service: AuditServiceDep,
    settings: SettingsDep,
    http_client: HttpClientDep,
) -> dict:
    """
    Builds the same DDS content `download_shipment_xml` does, then
    actually submits it to TRACES NT over SOAP with WS-Security
    authentication — see `app/services/traces_soap_client.py`'s module
    docstring for exactly what's verified about this (the cryptography;
    real, independently-tested) versus what isn't (whether the live
    endpoint and exact envelope shape match what TRACES NT's current
    WSDL expects — never confirmed against a real server, since this
    organization has no real TRACES NT credentials).

    Fails immediately, before touching the network, with a 501 and a
    clear explanation if `Settings.TRACES_USERNAME` /
    `TRACES_AUTHENTICATION_KEY` aren't set — which they won't be for any
    organization that hasn't completed the EU's own registration
    process. This is expected to fail that way for every real user of
    this product today; it exists so that the day real credentials are
    configured, submission is one endpoint call away, not a rebuild.
    """
    await _verify_shipment_ownership(rls_session, shipment_id)

    org_result = await rls_session.execute(
        text("SELECT require_export_approval FROM organizations WHERE id = :organization_id"),
        {"organization_id": current_user.organization_id},
    )
    org_row = org_result.first()
    if org_row is not None and org_row.require_export_approval:
        approval_result = await rls_session.execute(
            text("SELECT 1 FROM shipment_approvals WHERE shipment_id = :shipment_id LIMIT 1"),
            {"shipment_id": shipment_id},
        )
        if approval_result.first() is None:
            raise ExportApprovalRequiredError()

    shipment = shipment_store.get(shipment_id)
    if shipment is None:
        raise ShipmentNotFoundError(
            f"Shipment '{shipment_id}' belongs to your organization but its processed data is no "
            "longer available (the server may have restarted since it was processed)."
        )

    operator_payload = build_operator_payload(body)
    shipment_payload = build_shipment_payload(shipment, body)
    try:
        dds_element = build_dds_element(shipment_payload, operator_payload)
    except DdsValidationError as exc:
        logger.info("Shipment %s: DDS validation rejected the submission: %s", shipment_id, exc)
        raise
    except XmlGenerationError:
        logger.error("Shipment %s: DDS content construction failed unexpectedly.", shipment_id)
        raise

    result = await submit_dds_to_traces(settings, http_client, dds_element)

    logger.info("Shipment %s: submitted to TRACES NT (%s).", shipment_id, settings.TRACES_BASE_URL)

    await audit_service.log_event(
        shipment_id=shipment_id,
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        actor=ACTOR_CANOPY_AI,
        action_type="TRACES_SUBMISSION_ATTEMPTED",
        details={
            "shipment_id": shipment_id,
            "operator_name": operator_payload["name"],
            "activity_type": shipment_payload["activity_type"],
            "traces_environment": settings.TRACES_WEB_SERVICE_CLIENT_ID,
            "submitted_by_user_id": current_user.user_id,
        },
    )

    return result


@router.get(
    "/{shipment_id}/audit-trail",
    response_model=AuditTrailResponse,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID in your organization."},
        422: {"model": ErrorResponse, "description": "shipment_id is not a valid identifier."},
        503: {"model": ErrorResponse, "description": "The audit trail database is temporarily unavailable."},
    },
    summary="Retrieve the complete, chronological compliance audit trail for a shipment.",
)
async def get_shipment_audit_trail(
    shipment_id: str,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
) -> AuditTrailResponse:
    """
    Returns every audit event recorded for a shipment, oldest first — the
    complete evidence trail of what CanoryAI's AI did, what satellite
    checks ran, whether mass balance passed, and when the DDS XML was
    generated. Reads directly from the append-only `audit_log` table (see
    `app/models/audit_log.py`) through `rls_session`, so cross-tenant
    isolation here is enforced by PostgreSQL itself, not by this route's
    own WHERE clause. This endpoint never writes to audit_log.
    """
    try:
        shipment_uuid = uuid.UUID(shipment_id)
    except ValueError as exc:
        raise InvalidShipmentDataError(f"'{shipment_id}' is not a valid shipment identifier.") from exc

    await _verify_shipment_ownership(rls_session, shipment_id)

    query = (
        select(AuditLog)
        .where(AuditLog.shipment_id == shipment_uuid)
        .order_by(AuditLog.timestamp.asc())
    )
    try:
        result = await rls_session.execute(query)
        rows = result.scalars().all()
    except SQLAlchemyError as exc:
        logger.error("Shipment %s: audit trail query failed: %s", shipment_id, exc)
        raise AuditTrailUnavailableError() from exc

    events = [AuditEventResponse.model_validate(row) for row in rows]

    logger.info(
        "Shipment %s: audit trail retrieved by user %s (%d event(s)).",
        shipment_id,
        current_user.user_id,
        len(events),
    )

    return AuditTrailResponse(shipment_id=shipment_id, events=events)


def _parse_document_id(document_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(document_id)
    except ValueError as exc:
        raise InvalidShipmentDataError(f"'{document_id}' is not a valid document identifier.") from exc


@router.get(
    "/{shipment_id}/documents/flags",
    response_model=list[DocumentFlagResponse],
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID in your organization."},
    },
    summary="List every document in this shipment that is currently flagged for review.",
)
async def list_document_flags(shipment_id: str, rls_session: RlsSessionDep) -> list[DocumentFlagResponse]:
    """
    Powers the results table's Status column and the AI Document Review
    page's "Flagged" filter — one call per shipment rather than one per
    document row. Only currently-flagged documents are returned; a
    resolved flag drops out of this list (its history remains in
    `document_flags` and in `audit_log`, just not "currently flagged").
    """
    await _verify_shipment_ownership(rls_session, shipment_id)

    try:
        result = await rls_session.execute(
            text(
                "SELECT shipment_id, document_id, is_flagged, reason, flagged_by_email, "
                "flagged_at, resolved_by_email, resolved_at FROM document_flags "
                "WHERE shipment_id = :shipment_id AND is_flagged = true"
            ),
            {"shipment_id": shipment_id},
        )
    except SQLAlchemyError as exc:
        logger.error("Shipment %s: document_flags query failed: %s", shipment_id, exc)
        raise ReviewWorkflowUnavailableError() from exc
    return [DocumentFlagResponse.model_validate(dict(row._mapping)) for row in result.fetchall()]


@router.post(
    "/{shipment_id}/documents/{document_id}/flag",
    response_model=DocumentFlagResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID in your organization."},
        422: {"model": ErrorResponse, "description": "document_id is not a valid identifier."},
    },
    summary="Flag a document for manual review.",
)
async def flag_document(
    shipment_id: str,
    document_id: str,
    body: FlagDocumentRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    audit_service: AuditServiceDep,
) -> DocumentFlagResponse:
    """
    Any authenticated org member can raise a flag — flagging is "I think
    a human should look at this", deliberately a low bar so it's actually
    used, unlike resolving one (see `resolve_document_flag`'s docstring).
    Upserts on `(shipment_id, document_id)`: re-flagging an
    already-flagged document just updates the reason/flagged_by/flagged_at
    and clears any prior resolution, rather than erroring or duplicating.
    """
    await _verify_shipment_ownership(rls_session, shipment_id)
    document_uuid = _parse_document_id(document_id)

    try:
        result = await rls_session.execute(
            text(
                """
                INSERT INTO document_flags
                    (shipment_id, document_id, organization_id, is_flagged, reason,
                     flagged_by_user_id, flagged_by_email, flagged_at,
                     resolved_by_user_id, resolved_by_email, resolved_at)
                VALUES
                    (:shipment_id, :document_id, :organization_id, true, :reason,
                     :user_id, :email, now(), NULL, NULL, NULL)
                ON CONFLICT (shipment_id, document_id) DO UPDATE SET
                    is_flagged = true,
                    reason = EXCLUDED.reason,
                    flagged_by_user_id = EXCLUDED.flagged_by_user_id,
                    flagged_by_email = EXCLUDED.flagged_by_email,
                    flagged_at = now(),
                    resolved_by_user_id = NULL,
                    resolved_by_email = NULL,
                    resolved_at = NULL
                RETURNING shipment_id, document_id, is_flagged, reason, flagged_by_email,
                          flagged_at, resolved_by_email, resolved_at
                """
            ),
            {
                "shipment_id": shipment_id,
                "document_id": str(document_uuid),
                "organization_id": str(current_user.organization_id),
                "reason": body.reason,
                "user_id": str(current_user.user_id),
                "email": current_user.email,
            },
        )
        row = result.first()
    except SQLAlchemyError as exc:
        logger.error("Shipment %s: flagging document %s failed: %s", shipment_id, document_id, exc)
        raise ReviewWorkflowUnavailableError() from exc

    await audit_service.log_event(
        shipment_id=shipment_id,
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        actor=current_user.email or current_user.user_id,
        action_type="DOCUMENT_FLAGGED",
        details={"document_id": document_id, "reason": body.reason},
    )

    logger.info("Shipment %s: document %s flagged for review by %s", shipment_id, document_id, current_user.user_id)
    return DocumentFlagResponse.model_validate(dict(row._mapping))


@router.delete(
    "/{shipment_id}/documents/{document_id}/flag",
    response_model=DocumentFlagResponse,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        403: {"model": ErrorResponse, "description": "Only owners, admins, and compliance managers can resolve a flag."},
        404: {"model": ErrorResponse, "description": "No shipment with this ID, or this document has no active flag."},
        422: {"model": ErrorResponse, "description": "document_id is not a valid identifier."},
    },
    summary="Resolve (clear) an active review flag on a document.",
)
async def resolve_document_flag(
    shipment_id: str,
    document_id: str,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    audit_service: AuditServiceDep,
) -> DocumentFlagResponse:
    """
    Deliberately gated to owners/admins/compliance managers, unlike
    raising a flag — dismissing someone else's compliance concern is a
    more consequential action than raising one, the same asymmetry
    `approve_shipment_export` applies to export sign-off.
    """
    if current_user.role not in ("owner", "admin", "compliance_manager"):
        raise InsufficientRoleError("Only owners, admins, and compliance managers can resolve a review flag.")

    await _verify_shipment_ownership(rls_session, shipment_id)
    document_uuid = _parse_document_id(document_id)

    try:
        result = await rls_session.execute(
            text(
                """
                UPDATE document_flags
                SET is_flagged = false, resolved_by_user_id = :user_id,
                    resolved_by_email = :email, resolved_at = now()
                WHERE shipment_id = :shipment_id AND document_id = :document_id AND is_flagged = true
                RETURNING shipment_id, document_id, is_flagged, reason, flagged_by_email,
                          flagged_at, resolved_by_email, resolved_at
                """
            ),
            {
                "shipment_id": shipment_id,
                "document_id": str(document_uuid),
                "user_id": str(current_user.user_id),
                "email": current_user.email,
            },
        )
        row = result.first()
    except SQLAlchemyError as exc:
        logger.error("Shipment %s: resolving flag on document %s failed: %s", shipment_id, document_id, exc)
        raise ReviewWorkflowUnavailableError() from exc
    if row is None:
        raise ShipmentNotFoundError(
            f"Document '{document_id}' has no active review flag in shipment '{shipment_id}'."
        )

    await audit_service.log_event(
        shipment_id=shipment_id,
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        actor=current_user.email or current_user.user_id,
        action_type="DOCUMENT_FLAG_RESOLVED",
        details={"document_id": document_id},
    )

    logger.info("Shipment %s: review flag on document %s resolved by %s", shipment_id, document_id, current_user.user_id)
    return DocumentFlagResponse.model_validate(dict(row._mapping))


@router.post(
    "/{shipment_id}/documents/{document_id}/verify-satellite",
    response_model=SatelliteVerificationResult,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        400: {"model": ErrorResponse, "description": "This document has no GPS coordinate on record."},
        404: {"model": ErrorResponse, "description": "No shipment or document with this ID in your organization."},
        422: {"model": ErrorResponse, "description": "document_id is not a valid identifier."},
    },
    summary="Re-check a document's coordinates against Global Forest Watch, live, and persist the result.",
)
async def verify_document_satellite(
    shipment_id: str,
    document_id: str,
    body: VerifySatelliteRequest,  # noqa: ARG001 — kept for API compatibility; see docstring
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    shipment_store: ShipmentStoreDep,
    document_review_service: DocumentReviewServiceDep,
) -> SatelliteVerificationResult:
    """
    Powers the results table's "Verify against satellite imagery" action
    and the satellite-verify dialog's "Re-check GFW" button.

    Delegates entirely to `DocumentReviewService.reverify_satellite`,
    which calls the exact same `GeospatialService.verify_plot_compliance`
    the shipment-processing pipeline itself uses — same GFW query, same
    EUDR cutoff business rules — and, critically, **writes the fresh
    result back into the shipment's stored record** (both the in-memory
    cache and the durable `shipments.payload` column), recomputing the
    shipment-wide compliance summary to match. Calling
    `GeospatialService` directly here (as this endpoint originally did)
    returned a correct result to the one request that asked for it, but
    never updated the stored document — so the results table's Satellite
    Verification column, and every other view of this shipment, kept
    showing the stale pre-check status forever, reverting the moment the
    page was reloaded. That was a real, shipped bug: the badge only
    appeared to update because the frontend was told about the fresh
    result directly, not because anything durable had changed.

    `body.latitude`/`body.longitude` are intentionally unused: the
    service re-verifies against the document's own stored coordinate,
    the same one this whole check is about — accepting different
    coordinates from the request would let a client re-verify a
    completely different location under this document's name. The
    request body is kept only so the frontend doesn't need to change.
    """
    await _verify_shipment_ownership(rls_session, shipment_id)
    _parse_document_id(document_id)  # validates document_id shape; result unused

    shipment = shipment_store.get(shipment_id) or await _load_shipment_from_db(
        rls_session, shipment_store, shipment_id
    )

    document = await document_review_service.reverify_satellite(
        shipment=shipment,
        document_id=document_id,
        organization_id=str(current_user.organization_id),
        acting_user_id=str(current_user.user_id),
    )
    assert document.satellite_verification is not None  # guaranteed by reverify_satellite's own precondition
    return document.satellite_verification




async def _verify_shipment_ownership(rls_session: AsyncSession, shipment_id: str) -> None:
    """
    Confirm the shipment is visible through the caller's RLS-scoped
    session — i.e. it exists AND belongs to their organization. Raises
    `ShipmentNotFoundError` (404) either way if not, deliberately never
    distinguishing "doesn't exist" from "belongs to someone else".
    """
    try:
        shipment_uuid = uuid.UUID(shipment_id)
    except ValueError as exc:
        raise InvalidShipmentDataError(f"'{shipment_id}' is not a valid shipment identifier.") from exc

    result = await rls_session.execute(
        text("SELECT 1 FROM shipments WHERE id = :id"), {"id": str(shipment_uuid)}
    )
    if result.first() is None:
        raise ShipmentNotFoundError(f"No shipment found with ID '{shipment_id}' in your organization.")
