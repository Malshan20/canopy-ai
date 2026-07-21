"""
Audit Vault schemas: the canonical set of action types currently emitted
by the platform, and the response shapes for
`GET /api/v1/shipments/{shipment_id}/audit-trail`.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Final, Literal

from pydantic import BaseModel, ConfigDict

# The canonical action_type values currently emitted anywhere in the
# platform. The database column is a plain string (new event types can be
# added without a migration), but every *known* type is listed here so
# frontend/backend stay honest about what's actually emitted — grep for
# `AuditActionType` usages before adding a new literal.
AuditActionType = Literal[
    "DOCUMENT_EXTRACTED",
    "SATELLITE_CHECK_COMPLETED",
    "SATELLITE_CHECK_FAILED",
    "MASS_BALANCE_PASSED",
    "MASS_BALANCE_FAILED",
    "XML_GENERATED",
    "MANUAL_OVERRIDE",
]

KNOWN_ACTION_TYPES: Final[tuple[str, ...]] = (
    "DOCUMENT_EXTRACTED",
    "SATELLITE_CHECK_COMPLETED",
    "SATELLITE_CHECK_FAILED",
    "MASS_BALANCE_PASSED",
    "MASS_BALANCE_FAILED",
    "XML_GENERATED",
    "MANUAL_OVERRIDE",
)


class AuditEventResponse(BaseModel):
    """A single audit event as returned by the audit trail API."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    timestamp: datetime
    actor: str
    action_type: str
    details: dict[str, Any]


class AuditTrailResponse(BaseModel):
    """Response returned by GET /api/v1/shipments/{shipment_id}/audit-trail."""

    shipment_id: str
    events: list[AuditEventResponse]
