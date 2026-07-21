"""
Top-level API response schemas returned by the v1 routes.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.schemas.compliance import ComplianceSummary
from app.schemas.documents import DocumentResult


class ShipmentUploadResponse(BaseModel):
    """Response returned by POST /api/v1/shipments/upload-zip."""

    shipment_id: str
    documents_processed: int
    documents: list[DocumentResult]
    compliance: ComplianceSummary


class ErrorResponse(BaseModel):
    """Generic structured error response shape used across the API."""

    error: str
    detail: str
