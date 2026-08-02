"""
Shipment processing orchestration service.

Coordinates the full Phase 3 pipeline:

    Upload -> Extraction -> GPS Validation -> Satellite Verification
    -> Mass Balance -> Final Compliance Report

This is the only service the API layer needs to call directly — all other
services (ZIP handling, scanning, classification, extraction, geospatial
verification, mass balance) are internal collaborators wired in via
dependency injection.
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
import time
import uuid
from pathlib import Path
from collections import Counter

from fastapi import UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.exceptions import InvalidCoordinateError, QuotaExceededError
from app.core.logging import get_logger
from app.models.domain import DiscoveredFile
from app.schemas.compliance import ComplianceSummary, MassBalanceResult, SatelliteVerificationResult
from app.schemas.documents import VISION_ELIGIBLE_CLASSIFICATIONS, DocumentResult
from app.schemas.responses import ShipmentUploadResponse
from app.services.coordinate_parser import coordinate_cache_key, parse_gps_coordinates
from app.services.plausibility_checker import (
    check_coordinate_plausibility,
    check_country_validity,
    check_weight_plausibility,
)
from app.services.file_scanner import FileScanner
from app.services.gemini_extractor import GeminiExtractor
from app.services.geospatial_service import GeospatialService
from app.services.groq_classifier import GroqClassifier
from app.services.mass_balance_engine import compute_mass_balance
from app.services.audit_service import ACTOR_CANOPY_AI, AuditService
from app.services.plan_limits import get_documents_per_shipment_limit, get_max_file_size_bytes
from app.services.shipment_store import InMemoryShipmentStore
from app.services.storage_service import StorageService
from app.services.notification_service import NotificationService
from app.services.webhook_service import WebhookService
from app.services.zip_service import ZipService

logger = get_logger(__name__)


def build_compliance_summary(
    documents: list[DocumentResult], mass_balance: MassBalanceResult
) -> ComplianceSummary:
    """
    Roll up per-document satellite results and the mass balance check into
    the shipment-wide compliance report.

    A module-level function (not a method) so it's the single source of
    truth for this rollup logic: both the initial processing pipeline
    (`ShipmentProcessingService._build_compliance_summary`, a thin wrapper
    below) and `DocumentReviewService` — which needs to recompute the same
    summary after a live satellite re-check changes one document's result
    — call this exact same code, rather than keeping two copies of the
    readiness rules in sync by hand.
    """
    critical_farms = 0
    verified_farms = 0
    pending_verification = 0
    plausibility_flag_count = 0

    for document in documents:
        if document.plausibility_flags:
            plausibility_flag_count += 1

        verification = document.satellite_verification
        if verification is None:
            continue
        if verification.risk == "critical":
            critical_farms += 1
        elif verification.risk == "low":
            verified_farms += 1
        else:
            pending_verification += 1

    total_checked = critical_farms + verified_farms + pending_verification
    percentage_verified = (
        ((critical_farms + verified_farms) / total_checked) * 100 if total_checked > 0 else 100.0
    )

    if critical_farms > 0 or mass_balance.severity == "critical":
        readiness = "blocked"
    elif pending_verification > 0 or mass_balance.status == "mass_balance_mismatch" or plausibility_flag_count > 0:
        # A plausibility flag alone is never a hard block — these are
        # sanity checks, not certain errors — but it must never let a
        # shipment reach "ready" silently. A human needs to look at
        # the specific flagged value before this shipment is treated
        # as clean, the same as any other "needs_review" reason.
        readiness = "needs_review"
    else:
        readiness = "ready"

    return ComplianceSummary(
        readiness=readiness,  # type: ignore[arg-type]
        critical_farms=critical_farms,
        verified_farms=verified_farms,
        pending_verification=pending_verification,
        percentage_verified=round(percentage_verified, 1),
        total_coordinates_checked=total_checked,
        mass_balance=mass_balance,
        plausibility_flag_count=plausibility_flag_count,
    )


class ShipmentProcessingService:
    """High-level use case: 'process an uploaded shipment ZIP end to end'."""

    def __init__(
        self,
        settings: Settings,
        zip_service: ZipService,
        file_scanner: FileScanner,
        classifier: GroqClassifier,
        extractor: GeminiExtractor,
        geospatial_service: GeospatialService,
        shipment_store: InMemoryShipmentStore,
        audit_service: AuditService,
        db_session_factory: async_sessionmaker[AsyncSession],
        storage_service: StorageService,
        webhook_service: WebhookService,
        notification_service: NotificationService,
    ) -> None:
        self._settings = settings
        self._zip_service = zip_service
        self._file_scanner = file_scanner
        self._classifier = classifier
        self._extractor = extractor
        self._geospatial_service = geospatial_service
        self._shipment_store = shipment_store
        self._audit_service = audit_service
        self._db_session_factory = db_session_factory
        self._storage_service = storage_service
        self._webhook_service = webhook_service
        self._notification_service = notification_service
        self._ai_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_AI_CALLS)
        self._satellite_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_SATELLITE_CALLS)

    async def process_upload(
        self,
        upload: UploadFile,
        total_declared_weight_kg: float,
        organization_id: str,
        user_id: str,
    ) -> ShipmentUploadResponse:
        """
        Synchronous pipeline entry point: persist the upload to disk, then
        run the full pipeline immediately and return the complete result
        in this same request. This is the original, still fully-supported
        path — e.g. for API-key integrations that want a synchronous
        result rather than polling a job. For the priority-queue path
        instead (Enterprise/Custom tiers get processed ahead of Growth —
        see app/models/processing_job.py), see
        `app/api/v1/shipments.py`'s `upload_shipment_zip_async`, which
        persists the upload then enqueues a `processing_jobs` row for
        `JobWorker` (app/services/job_worker.py) to pick up and run
        through `process_from_zip_path` below — the exact same pipeline
        logic, just invoked by the worker instead of inline in a request.
        """
        zip_path = await self._zip_service.persist_upload(upload)
        return await self.process_from_zip_path(
            zip_path=zip_path,
            source_filename=upload.filename or "upload.zip",
            total_declared_weight_kg=total_declared_weight_kg,
            organization_id=organization_id,
            user_id=user_id,
        )

    async def process_from_zip_path(
        self,
        zip_path: Path,
        source_filename: str,
        total_declared_weight_kg: float,
        organization_id: str,
        user_id: str,
        shipment_id: str | None = None,
    ) -> ShipmentUploadResponse:
        """
        The actual pipeline: extract -> scan -> classify -> extract ->
        validate GPS -> verify satellite imagery -> check mass balance ->
        respond with a complete compliance report. Takes an
        already-persisted ZIP path rather than a live `UploadFile` so it
        can be called identically from a synchronous request
        (`process_upload`, which persists the upload itself first) or
        from `JobWorker` processing an already-queued, already-persisted
        job — this is the one place that pipeline logic lives; neither
        caller duplicates it.
        """
        shipment_id = shipment_id or str(uuid.uuid4())
        start_time = time.monotonic()
        logger.info(
            "Shipment %s: processing started (filename=%s, declared_weight=%.2f kg).",
            shipment_id,
            source_filename,
            total_declared_weight_kg,
        )

        job_dir = zip_path.parent

        try:
            extract_dir = await self._zip_service.extract(zip_path)
            logger.info("Shipment %s: ZIP extracted to %s.", shipment_id, extract_dir)

            discovered_files = self._file_scanner.scan(extract_dir)

            await self._enforce_plan_upload_limits(organization_id, discovered_files)

            raw_documents: list[dict] = []
            documents = list(
                await asyncio.gather(
                    *(
                        self._process_single_file(shipment_id, item, organization_id, user_id, raw_documents)
                        for item in discovered_files
                    )
                )
            )

            documents = await self._run_satellite_verification(shipment_id, documents, organization_id, user_id)

            mass_balance = compute_mass_balance(
                declared_weight_kg=total_declared_weight_kg,
                documents=documents,
                tolerance_fraction=self._settings.MASS_BALANCE_TOLERANCE_FRACTION,
            )

            await self._audit_service.log_event(
                shipment_id=shipment_id,
                organization_id=organization_id,
                acting_user_id=user_id,
                actor=ACTOR_CANOPY_AI,
                action_type=(
                    "MASS_BALANCE_FAILED"
                    if mass_balance.status == "mass_balance_mismatch"
                    else "MASS_BALANCE_PASSED"
                ),
                details={
                    "declared_weight_kg": mass_balance.declared_weight_kg,
                    "extracted_weight_kg": mass_balance.extracted_weight_kg,
                    "difference_kg": mass_balance.difference_kg,
                    "percentage_difference": mass_balance.percentage_difference,
                    "tolerance_percentage": mass_balance.tolerance_percentage,
                    "severity": mass_balance.severity,
                    "documents_included": mass_balance.documents_included,
                    "documents_excluded": mass_balance.documents_excluded,
                },
            )

            compliance = self._build_compliance_summary(documents, mass_balance)

            duration = time.monotonic() - start_time
            logger.info(
                "Shipment %s: processing complete (%d documents, readiness=%s, %.2fs).",
                shipment_id,
                len(documents),
                compliance.readiness,
                duration,
            )

            response = ShipmentUploadResponse(
                shipment_id=shipment_id,
                documents_processed=len(documents),
                documents=documents,
                compliance=compliance,
            )
            await self._record_shipment_ownership(
                shipment_id=shipment_id,
                organization_id=organization_id,
                user_id=user_id,
                source_filename=source_filename,
                declared_weight_kg=total_declared_weight_kg,
                response=response,
            )
            await self._persist_raw_documents(
                shipment_id=shipment_id,
                organization_id=organization_id,
                user_id=user_id,
                raw_documents=raw_documents,
            )
            self._shipment_store.save(response)

            # Fire-and-forget from the caller's perspective in spirit (best
            # effort, never raises — see WebhookService's docstring) but
            # still awaited here rather than launched as a detached task,
            # so a slow customer endpoint's timeout is at most 10s per
            # webhook added to this request, not silently dropped if the
            # process were to exit right after responding.
            await self._webhook_service.dispatch_shipment_completed(
                organization_id=organization_id,
                user_id=user_id,
                shipment_id=shipment_id,
                readiness=compliance.readiness,
                documents_processed=len(documents),
            )

            readiness_label = {
                "ready": "has passed all compliance checks and is ready for DDS export",
                "needs_review": "needs manual review before it can be exported",
                "blocked": "was blocked — one or more compliance checks failed",
            }.get(compliance.readiness, "has finished processing")
            await self._notification_service.notify(
                organization_id=organization_id,
                acting_user_id=user_id,
                notif_type="shipment_completed",
                title=f"Shipment {source_filename} processed",
                body=f"{len(documents)} document(s) processed. This shipment {readiness_label}.",
                link=f"/shipments/{shipment_id}",
            )
            return response
        finally:
            self._zip_service.cleanup(job_dir)

    async def _enforce_plan_upload_limits(
        self, organization_id: str, discovered_files: list[DiscoveredFile]
    ) -> None:
        """
        Checks the two upload-time plan limits pricing.tsx advertises but
        this pipeline never actually enforced: documents per shipment
        (Growth 25 / Enterprise 100 / Custom unlimited) and max size per
        document (Growth 25 MB / Enterprise 100 MB / Custom 100 MB — see
        plan_limits.py for why Custom isn't literally unlimited here).

        Runs right after the ZIP is scanned and before the costly
        classification/extraction fan-out begins — rejecting an
        over-limit upload should be near-instant, not something a
        customer discovers after waiting through AI processing for
        documents that were never going to be accepted.

        Uses its own short-lived session (same pattern as
        `_record_shipment_ownership` below) rather than threading a
        session through every caller of `process_from_zip_path` just for
        this one lookup.
        """
        async with self._db_session_factory() as session:
            plan_result = await session.execute(
                text("SELECT plan FROM organizations WHERE id = :id"), {"id": organization_id}
            )
            plan_row = plan_result.first()
            plan = plan_row.plan if plan_row is not None else "growth"

        document_limit = get_documents_per_shipment_limit(plan)
        if document_limit is not None and len(discovered_files) > document_limit:
            raise QuotaExceededError(
                f"Your organization's '{plan}' plan allows up to {document_limit} documents per "
                f"shipment, and this upload contains {len(discovered_files)}. Split it into smaller "
                f"shipments, or upgrade your plan."
            )

        max_file_size = get_max_file_size_bytes(plan)
        oversized = [f.metadata for f in discovered_files if f.metadata.size_bytes > max_file_size]
        if oversized:
            names = ", ".join(f"'{f.filename}' ({f.size_bytes / (1024 * 1024):.1f} MB)" for f in oversized[:5])
            more = f" and {len(oversized) - 5} more" if len(oversized) > 5 else ""
            raise QuotaExceededError(
                f"Your organization's '{plan}' plan allows documents up to "
                f"{max_file_size / (1024 * 1024):.0f} MB each. Too large: {names}{more}."
            )

    async def _record_shipment_ownership(
        self,
        *,
        shipment_id: str,
        organization_id: str,
        user_id: str,
        source_filename: str | None,
        declared_weight_kg: float,
        response: ShipmentUploadResponse,
    ) -> None:
        """
        Write the durable, RLS-protected ownership + compliance-summary row
        for this shipment (see app/models/shipment.py), including the full
        result payload as JSONB. Uses its own RLS-scoped session, exactly
        like AuditService — this is the row every later request (XML
        export, audit trail, shipments list, dashboard, compliance
        overview, and now the shipment detail page itself) reads from, so
        it must succeed independently of whatever the caller's own session
        state looks like. Never raises: a failure here is logged loudly
        (it means a real gap in tenant-isolation *and* reporting coverage
        for this shipment) but must not crash an otherwise-successful
        upload.
        """
        documents = response.documents
        compliance = response.compliance

        confidences = [
            doc.extracted_data.ai_confidence_score
            for doc in documents
            if doc.extracted_data is not None
        ]
        average_confidence = sum(confidences) / len(confidences) if confidences else None

        commodity = self._derive_most_common_field(documents, "commodity")
        country_of_production = self._derive_most_common_field(documents, "country")

        # model_dump_json (not model_dump + json.dumps) so datetimes/enums
        # serialize exactly as Pydantic would for the real API response —
        # this JSONB column should always be byte-for-byte reconstructable
        # into the same ShipmentUploadResponse shape callers already know.
        payload_json = response.model_dump_json()

        claims = json.dumps({"sub": user_id, "organization_id": organization_id, "role": "authenticated"})
        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"),
                        {"claims": claims},
                    )
                    await session.execute(
                        text(
                            "INSERT INTO shipments "
                            "(id, organization_id, created_by, source_filename, declared_weight_kg, "
                            "readiness, documents_processed, average_confidence, critical_farms, "
                            "verified_farms, pending_verification, mass_balance_status, commodity, "
                            "country_of_production, payload) "
                            "VALUES (:id, :organization_id, :created_by, :source_filename, "
                            ":declared_weight_kg, :readiness, :documents_processed, :average_confidence, "
                            ":critical_farms, :verified_farms, :pending_verification, :mass_balance_status, "
                            ":commodity, :country_of_production, :payload)"
                        ),
                        {
                            "id": shipment_id,
                            "organization_id": organization_id,
                            "created_by": user_id,
                            "source_filename": source_filename,
                            "declared_weight_kg": declared_weight_kg,
                            "readiness": compliance.readiness,
                            "documents_processed": len(documents),
                            "average_confidence": average_confidence,
                            "critical_farms": compliance.critical_farms,
                            "verified_farms": compliance.verified_farms,
                            "pending_verification": compliance.pending_verification,
                            "mass_balance_status": compliance.mass_balance.status,
                            "commodity": commodity,
                            "country_of_production": country_of_production,
                            "payload": payload_json,
                        },
                    )
            logger.info("Shipment %s: ownership row recorded (organization=%s).", shipment_id, organization_id)
        except Exception as exc:  # noqa: BLE001 - must never crash an otherwise-successful upload
            logger.error(
                "Shipment %s: FAILED to record ownership row for organization %s: %s",
                shipment_id,
                organization_id,
                exc,
            )

    async def _process_single_file(
        self, shipment_id: str, item: DiscoveredFile, organization_id: str, user_id: str, raw_documents: list[dict]
    ) -> DocumentResult:
        """Classify a document and, if eligible, run vision extraction on it."""
        metadata = item.metadata

        async with self._ai_semaphore:
            try:
                classification_result = await self._classifier.classify(
                    filename=metadata.filename,
                    extension=metadata.extension,
                    absolute_path=item.absolute_path,
                )
            except Exception as exc:  # noqa: BLE001 - convert to a per-document failure, not a 500
                logger.error(
                    "Shipment %s: classification failed for '%s': %s",
                    shipment_id,
                    metadata.filename,
                    exc,
                )
                return DocumentResult(
                    document_id=metadata.document_id,
                    filename=metadata.filename,
                    classification="irrelevant",
                    status="classification_failed",
                    error_detail=str(exc),
                )

            classification = classification_result.classification

            raw_documents.append(
                await self._upload_document_to_storage(
                    shipment_id=shipment_id,
                    organization_id=organization_id,
                    item=item,
                    classification=classification,
                )
            )

            if classification not in VISION_ELIGIBLE_CLASSIFICATIONS:
                logger.info(
                    "Shipment %s: '%s' classified as '%s' (no extraction needed).",
                    shipment_id,
                    metadata.filename,
                    classification,
                )
                return DocumentResult(
                    document_id=metadata.document_id,
                    filename=metadata.filename,
                    classification=classification,
                    status="skipped_irrelevant" if classification == "irrelevant" else "processed",
                )

            try:
                extracted_data = await self._extractor.extract(
                    filename=metadata.filename,
                    extension=metadata.extension,
                    absolute_path=item.absolute_path,
                )
            except Exception as exc:  # noqa: BLE001 - convert to a per-document failure, not a 500
                logger.error(
                    "Shipment %s: extraction failed for '%s': %s",
                    shipment_id,
                    metadata.filename,
                    exc,
                )
                return DocumentResult(
                    document_id=metadata.document_id,
                    filename=metadata.filename,
                    classification=classification,
                    status="extraction_failed",
                    error_detail=str(exc),
                )

            logger.info(
                "Shipment %s: vision extraction complete for '%s'.", shipment_id, metadata.filename
            )

            extracted_field_names = [
                field_name
                for field_name, value in extracted_data.model_dump().items()
                if value is not None and field_name != "ai_confidence_score"
            ]
            await self._audit_service.log_event(
                shipment_id=shipment_id,
                organization_id=organization_id,
                acting_user_id=user_id,
                actor=ACTOR_CANOPY_AI,
                action_type="DOCUMENT_EXTRACTED",
                details={
                    "document_id": metadata.document_id,
                    "filename": metadata.filename,
                    "document_type": classification,
                    "fields_extracted": extracted_field_names,
                    "confidence": extracted_data.ai_confidence_score,
                },
            )

            weight_flag = check_weight_plausibility(
                extracted_data.commodity, extracted_data.crop_weight_kg
            )
            country_flag = check_country_validity(extracted_data.country)
            initial_flags = [flag for flag in (weight_flag, country_flag) if flag]

            return DocumentResult(
                document_id=metadata.document_id,
                filename=metadata.filename,
                classification=classification,
                status="processed",
                extracted_data=extracted_data,
                plausibility_flags=initial_flags,
            )

    async def _run_satellite_verification(
        self, shipment_id: str, documents: list[DocumentResult], organization_id: str, user_id: str
    ) -> list[DocumentResult]:
        """
        GPS Validation + Satellite Verification stages: parse every
        document's extracted GPS string, deduplicate identical coordinates
        so we never fire redundant Global Forest Watch requests for
        receipts sharing a plot, verify all unique coordinates
        concurrently (bounded by a semaphore), then attach each document's
        result — including an immediate `unknown` result for documents
        whose coordinates couldn't be parsed at all.
        """
        # document index -> parsed cache key (only present when parseable)
        cache_key_by_index: dict[int, tuple[float, float]] = {}
        coords_by_cache_key: dict[tuple[float, float], tuple[float, float]] = {}
        parse_failure_by_index: dict[int, str] = {}
        coordinate_flag_by_index: dict[int, str] = {}

        for index, document in enumerate(documents):
            if document.status != "processed" or document.extracted_data is None:
                continue

            raw_coordinates = document.extracted_data.gps_coordinates
            if not raw_coordinates:
                continue

            try:
                latitude, longitude = parse_gps_coordinates(raw_coordinates)
            except InvalidCoordinateError as exc:
                logger.warning(
                    "Shipment %s: GPS validation failed for '%s': %s",
                    shipment_id,
                    document.filename,
                    exc.message,
                )
                parse_failure_by_index[index] = exc.message
                continue

            coordinate_flag = check_coordinate_plausibility(
                document.extracted_data.country, latitude, longitude
            )
            if coordinate_flag:
                coordinate_flag_by_index[index] = coordinate_flag

            key = coordinate_cache_key(latitude, longitude)
            cache_key_by_index[index] = key
            coords_by_cache_key[key] = (latitude, longitude)

        unique_coordinates = list(coords_by_cache_key.items())
        logger.info(
            "Shipment %s: %d document(s) with GPS coordinates, %d unique plot(s) to verify "
            "(%d duplicate(s) deduplicated).",
            shipment_id,
            len(cache_key_by_index),
            len(unique_coordinates),
            len(cache_key_by_index) - len(unique_coordinates),
        )

        async def _verify_bounded(
            key: tuple[float, float], coords: tuple[float, float]
        ) -> tuple[tuple[float, float], SatelliteVerificationResult]:
            async with self._satellite_semaphore:
                result = await self._geospatial_service.verify_plot_compliance(
                    latitude=coords[0],
                    longitude=coords[1],
                    shipment_id=shipment_id,
                    organization_id=organization_id,
                    acting_user_id=user_id,
                )
            return key, result

        verification_pairs = await asyncio.gather(
            *(_verify_bounded(key, coords) for key, coords in unique_coordinates)
        )
        results_by_cache_key: dict[tuple[float, float], SatelliteVerificationResult] = dict(
            verification_pairs
        )

        updated_documents: list[DocumentResult] = []
        for index, document in enumerate(documents):
            if index in cache_key_by_index:
                key = cache_key_by_index[index]
                satellite_result = results_by_cache_key[key]
                update: dict[str, object] = {"satellite_verification": satellite_result}
                if index in coordinate_flag_by_index:
                    update["plausibility_flags"] = [
                        *document.plausibility_flags,
                        coordinate_flag_by_index[index],
                    ]
                updated_documents.append(document.model_copy(update=update))
            elif index in parse_failure_by_index:
                satellite_result = SatelliteVerificationResult(
                    latitude=0.0,
                    longitude=0.0,
                    status="unknown",
                    risk="unknown",
                    reason=f"Could not validate GPS coordinates: {parse_failure_by_index[index]}",
                    cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
                )
                updated_documents.append(
                    document.model_copy(update={"satellite_verification": satellite_result})
                )
            else:
                updated_documents.append(document)

        return updated_documents

    def _build_compliance_summary(
        self, documents: list[DocumentResult], mass_balance: MassBalanceResult
    ) -> ComplianceSummary:
        """Roll up per-document satellite results and the mass balance check
        into the shipment-wide compliance report."""
        return build_compliance_summary(documents, mass_balance)

    async def _upload_document_to_storage(
        self,
        *,
        shipment_id: str,
        organization_id: str,
        item: DiscoveredFile,
        classification: str,
    ) -> dict:
        """
        Uploads one document's original bytes to Supabase Storage
        (best-effort, see `app/services/storage_service.py`) and returns
        the metadata a `raw_documents` row needs. Deliberately does NOT
        write that row itself: this runs during per-document processing,
        which happens *before* the shipment's own row exists in the
        `shipments` table (that's written by `_record_shipment_ownership`
        only once every document is done) — `raw_documents.shipment_id`
        has a foreign key to it, so inserting here would fail every time.
        The caller collects these dicts and bulk-inserts them only after
        the shipment row exists — see `process_upload`.
        """
        metadata = item.metadata
        content_type, _ = mimetypes.guess_type(metadata.filename)

        storage_path: str | None = None
        try:
            with open(item.absolute_path, "rb") as f:
                content = f.read()
            storage_path = await self._storage_service.upload_document(
                organization_id=organization_id,
                shipment_id=shipment_id,
                filename=metadata.filename,
                content=content,
                content_type=content_type or "application/octet-stream",
            )
        except OSError as exc:
            logger.error(
                "Shipment %s: could not read '%s' from disk for storage upload: %s",
                shipment_id,
                metadata.filename,
                exc,
            )

        return {"filename": metadata.filename, "classification": classification, "storage_path": storage_path}

    async def _persist_raw_documents(
        self,
        *,
        shipment_id: str,
        organization_id: str,
        user_id: str,
        raw_documents: list[dict],
    ) -> None:
        """
        Bulk-writes every collected `raw_documents` row for this shipment,
        called only after `_record_shipment_ownership` has already
        created the parent `shipments` row (see
        `_upload_document_to_storage` for why the ordering matters here).
        Same reliability posture as audit logging: never raises, a
        failure here must not undo an otherwise-successful upload.
        """
        if not raw_documents:
            return

        claims_json = json.dumps({"sub": user_id, "organization_id": organization_id, "role": "authenticated"})
        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"),
                        {"claims": claims_json},
                    )
                    for doc in raw_documents:
                        await session.execute(
                            text(
                                "INSERT INTO raw_documents "
                                "(id, organization_id, shipment_id, filename, classification, storage_path) "
                                "VALUES (:id, :organization_id, :shipment_id, :filename, :classification, :storage_path)"
                            ),
                            {
                                "id": str(uuid.uuid4()),
                                "organization_id": organization_id,
                                "shipment_id": shipment_id,
                                "filename": doc["filename"],
                                "classification": doc["classification"],
                                "storage_path": doc["storage_path"],
                            },
                        )
        except Exception as exc:  # noqa: BLE001 - must never crash an otherwise-successful upload
            logger.error("Shipment %s: failed to persist raw_documents rows: %s", shipment_id, exc)

    @staticmethod
    def _derive_most_common_field(documents: list[DocumentResult], field: str) -> str | None:
        """
        Shipment-level value (e.g. commodity, country) derived as the most
        common non-null value for that field across all successfully
        extracted documents — the same "majority vote" approach
        `xml_data_builder.py` uses for the DDS export, applied here so the
        shipments list/dashboard can show a single representative value per
        shipment without needing to open every document.
        """
        values = [
            getattr(document.extracted_data, field)
            for document in documents
            if document.extracted_data is not None and getattr(document.extracted_data, field, None)
        ]
        if not values:
            return None
        most_common_value, _count = Counter(values).most_common(1)[0]
        return most_common_value
