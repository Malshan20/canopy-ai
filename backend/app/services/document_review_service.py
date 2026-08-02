"""
Manual document review actions — flagging a document for review,
resolving that flag, and re-running satellite verification for a single
document on demand.

These are mutations against an already-processed shipment's stored
result, not part of the initial ingestion pipeline. Each writes through
to both places a shipment result lives (see shipment_store.py and
`ShipmentProcessingService._record_shipment_ownership`): the fast
in-memory cache, when present, and the durable `shipments.payload` JSONB
column, so a flag or a live re-check survives a server restart and is
visible however the shipment is next loaded — exactly the same
durability contract `GET /shipments/{id}` already documents.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import DocumentHasNoCoordinatesError, DocumentNotFoundError
from app.core.logging import get_logger
from app.schemas.documents import DocumentResult
from app.schemas.responses import ShipmentUploadResponse
from app.services.audit_service import AuditService
from app.services.geospatial_service import GeospatialService
from app.services.shipment_processor import build_compliance_summary
from app.services.shipment_store import InMemoryShipmentStore

logger = get_logger(__name__)


class DocumentReviewService:
    """Flag/unflag a document, and re-run its satellite check on demand."""

    def __init__(
        self,
        shipment_store: InMemoryShipmentStore,
        geospatial_service: GeospatialService,
        audit_service: AuditService,
        db_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        self._shipment_store = shipment_store
        self._geospatial_service = geospatial_service
        self._audit_service = audit_service
        self._db_session_factory = db_session_factory

    async def flag_document(
        self,
        *,
        shipment: ShipmentUploadResponse,
        document_id: str,
        note: str | None,
        organization_id: str,
        acting_user_id: str,
    ) -> DocumentResult:
        """Mark a document as flagged for manual review."""
        document = self._find_document(shipment, document_id)
        document.flagged_for_review = True
        document.flag_note = note
        document.flagged_at = datetime.now(timezone.utc).isoformat()
        document.flagged_by = acting_user_id

        await self._persist(shipment, organization_id)
        await self._audit_service.log_event(
            shipment_id=shipment.shipment_id,
            organization_id=organization_id,
            acting_user_id=acting_user_id,
            actor=acting_user_id,
            action_type="DOCUMENT_FLAGGED_FOR_REVIEW",
            details={"document_id": document_id, "filename": document.filename, "note": note},
        )
        logger.info(
            "Shipment %s: document %s ('%s') flagged for review by %s.",
            shipment.shipment_id,
            document_id,
            document.filename,
            acting_user_id,
        )
        return document

    async def resolve_flag(
        self,
        *,
        shipment: ShipmentUploadResponse,
        document_id: str,
        organization_id: str,
        acting_user_id: str,
    ) -> DocumentResult:
        """Clear a document's review flag once it's been looked at."""
        document = self._find_document(shipment, document_id)
        document.flagged_for_review = False
        document.flag_note = None
        document.flagged_at = None
        document.flagged_by = None

        await self._persist(shipment, organization_id)
        await self._audit_service.log_event(
            shipment_id=shipment.shipment_id,
            organization_id=organization_id,
            acting_user_id=acting_user_id,
            actor=acting_user_id,
            action_type="DOCUMENT_REVIEW_RESOLVED",
            details={"document_id": document_id, "filename": document.filename},
        )
        logger.info(
            "Shipment %s: document %s ('%s') review flag resolved by %s.",
            shipment.shipment_id,
            document_id,
            document.filename,
            acting_user_id,
        )
        return document

    async def reverify_satellite(
        self,
        *,
        shipment: ShipmentUploadResponse,
        document_id: str,
        organization_id: str,
        acting_user_id: str,
    ) -> DocumentResult:
        """
        Re-run the Global Forest Watch check for a single document's
        coordinate right now, replacing its stored `satellite_verification`
        with the fresh result, then recomputes the shipment's compliance
        summary (`build_compliance_summary` — the exact function the
        original processing pipeline uses) so `critical_farms`,
        `readiness`, etc. reflect the update immediately, not just the
        one document.
        """
        document = self._find_document(shipment, document_id)
        if document.satellite_verification is None:
            raise DocumentHasNoCoordinatesError(
                f"Document '{document.filename}' has no GPS coordinate on record, so there is "
                "nothing to re-verify against satellite imagery."
            )

        fresh_result = await self._geospatial_service.verify_plot_compliance(
            latitude=document.satellite_verification.latitude,
            longitude=document.satellite_verification.longitude,
            shipment_id=shipment.shipment_id,
            organization_id=organization_id,
            acting_user_id=acting_user_id,
        )
        document.satellite_verification = fresh_result

        shipment.compliance = build_compliance_summary(shipment.documents, shipment.compliance.mass_balance)

        await self._persist(shipment, organization_id)
        logger.info(
            "Shipment %s: document %s ('%s') satellite verification re-run by %s -> status=%s, risk=%s.",
            shipment.shipment_id,
            document_id,
            document.filename,
            acting_user_id,
            fresh_result.status,
            fresh_result.risk,
        )
        return document

    @staticmethod
    def _find_document(shipment: ShipmentUploadResponse, document_id: str) -> DocumentResult:
        for document in shipment.documents:
            if document.document_id == document_id:
                return document
        raise DocumentNotFoundError(
            f"No document '{document_id}' was found in shipment '{shipment.shipment_id}'."
        )

    async def _persist(self, shipment: ShipmentUploadResponse, organization_id: str) -> None:
        """
        Write the mutated shipment back to the in-memory cache (if present
        — `save()` is a plain upsert, safe to call even if this shipment
        wasn't cached before) and the durable `shipments.payload` column,
        mirroring exactly how `_record_shipment_ownership` writes it the
        first time. Never raises: a failed write here is logged loudly,
        matching that method's own documented behavior, since the
        in-request mutation the caller already has should still be
        returned to the user even if the durable copy couldn't be updated.
        """
        self._shipment_store.save(shipment)

        payload_json = shipment.model_dump_json()
        claims = json.dumps({"organization_id": organization_id, "role": "authenticated"})
        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"),
                        {"claims": claims},
                    )
                    await session.execute(
                        text("UPDATE shipments SET payload = :payload WHERE id = :id"),
                        {"payload": payload_json, "id": shipment.shipment_id},
                    )
        except Exception as exc:  # noqa: BLE001 - must never crash an otherwise-successful review action
            logger.error(
                "Shipment %s: failed to persist document review update to the database: %s",
                shipment.shipment_id,
                exc,
            )
