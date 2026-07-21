"""
Organization-wide audit trail route.

Distinct from `GET /shipments/{id}/audit-trail` (Phase 5/6, still the
right endpoint for a single shipment's history): this route backs the
generic `/audit-trail` page, which has no shipment in its URL at all, so
it needs every event across the caller's organization rather than one
shipment's. Same append-only table, same RLS enforcement, same
never-writes-here guarantee — just without the `shipment_id` filter.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.dependencies import CurrentUserDep, RlsSessionDep
from app.core.exceptions import AuditTrailUnavailableError
from app.core.logging import get_logger
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditEventResponse
from app.schemas.responses import ErrorResponse

logger = get_logger(__name__)

router = APIRouter(prefix="/audit-trail", tags=["Audit"])


class OrganizationAuditTrailResponse(BaseModel):
    """Response for GET /api/v1/audit-trail."""

    events: list[AuditEventResponse]
    total: int
    page: int
    page_size: int


@router.get(
    "",
    response_model=OrganizationAuditTrailResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        503: {"model": ErrorResponse, "description": "The audit trail database is temporarily unavailable."},
    },
    summary="Organization-wide compliance audit trail, newest first.",
)
async def get_organization_audit_trail(
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> OrganizationAuditTrailResponse:
    try:
        count_result = await rls_session.execute(select(func.count()).select_from(AuditLog))
        total = count_result.scalar_one()

        query = (
            select(AuditLog)
            .order_by(AuditLog.timestamp.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await rls_session.execute(query)
        rows = result.scalars().all()
    except SQLAlchemyError as exc:
        logger.error("Organization %s: audit trail query failed: %s", current_user.organization_id, exc)
        raise AuditTrailUnavailableError() from exc

    events = [AuditEventResponse.model_validate(row) for row in rows]

    logger.info(
        "Organization %s: audit trail retrieved by user %s (page %d, %d event(s)).",
        current_user.organization_id,
        current_user.user_id,
        page,
        len(events),
    )

    return OrganizationAuditTrailResponse(events=events, total=total, page=page, page_size=page_size)
