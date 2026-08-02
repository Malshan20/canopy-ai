"""
Pydantic schemas describing document classification and extraction data.

These schemas form the internal + external contract for a single document's
lifecycle: discovery metadata -> classification -> (optional) extraction ->
final result returned to the API consumer.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.compliance import SatelliteVerificationResult

# --- Classification ---

DocumentClassification = Literal[
    "weighbridge_receipt",
    "land_deed",
    "tax_id",
    "due_diligence_statement",
    "irrelevant",
]

VISION_ELIGIBLE_CLASSIFICATIONS: tuple[DocumentClassification, ...] = (
    "weighbridge_receipt",
    "land_deed",
    "due_diligence_statement",
)

ProcessingStatus = Literal[
    "processed",
    "skipped_irrelevant",
    "classification_failed",
    "extraction_failed",
    "unsupported_file",
]


class DocumentMetadata(BaseModel):
    """Metadata describing a single file discovered inside the uploaded ZIP."""

    document_id: str
    filename: str
    relative_path: str
    extension: str
    size_bytes: int
    mime_type: str


class ExtractedData(BaseModel):
    """
    Structured data extracted from a weighbridge receipt, land deed, or
    due diligence statement via Gemini vision extraction.

    Required fields are modeled as Optional because honest extraction may
    legitimately fail to find a value (in which case Gemini returns null
    rather than a fabricated value). `ai_confidence_score` always has a
    value since the model is instructed to always estimate it.
    """

    # Required fields (per spec) — value may still be null if not confidently found.
    farmer_name: Optional[str] = Field(default=None)
    crop_weight_kg: Optional[float] = Field(
        default=None,
        description=(
            "Canonical extracted weight for mass-balance purposes. For a "
            "weighbridge receipt this is the receipt's crop weight; for a "
            "due diligence statement this is the declared shipment "
            "quantity (also duplicated in `quantity_kg` under its native "
            "label so the UI can show it correctly either way)."
        ),
    )
    date_of_transaction: Optional[str] = Field(
        default=None, description="ISO date format YYYY-MM-DD"
    )
    gps_coordinates: Optional[str] = Field(default=None)
    ai_confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)

    # Optional fields — included only when confidently extracted, else null.
    supplier_name: Optional[str] = None
    village: Optional[str] = None
    commodity: Optional[str] = None
    receipt_number: Optional[str] = None
    country: Optional[str] = None
    language_detected: Optional[str] = None
    document_notes: Optional[str] = None

    # Due diligence statement fields (Rainforest Alliance / TRACES NT-style
    # EUDR DDS evidence documents — Regulation (EU) 2023/1115 Article 4/9).
    operator_name: Optional[str] = Field(
        default=None, description="The importing operator submitting the due diligence statement."
    )
    hs_code: Optional[str] = Field(default=None, description="Harmonized System code for the commodity.")
    product_name: Optional[str] = Field(default=None)
    quantity_kg: Optional[float] = Field(
        default=None, description="Declared net mass in kg, as printed on the statement."
    )
    reference_number: Optional[str] = Field(default=None)
    statement_date: Optional[str] = Field(
        default=None, description="Date the statement was signed, ISO format YYYY-MM-DD if legible."
    )
    deforestation_free_declared: Optional[bool] = Field(
        default=None,
        description="Whether Section A explicitly declares the products deforestation-free.",
    )
    legal_compliance_conformity: Optional[bool] = Field(
        default=None,
        description="True only if every row in the legal compliance table reads 'Conformity'.",
    )
    geolocation_evidence_present: Optional[bool] = Field(
        default=None,
        description=(
            "True when the statement includes a geolocation map/plot evidence section — even "
            "though the plot coordinates in that map are not machine-readable text, so "
            "`gps_coordinates` will typically remain null for this document type."
        ),
    )


class DocumentResult(BaseModel):
    """Final per-document result returned to the API consumer."""

    document_id: str
    filename: str
    classification: DocumentClassification
    status: ProcessingStatus
    extracted_data: Optional[ExtractedData] = None
    error_detail: Optional[str] = None
    satellite_verification: Optional[SatelliteVerificationResult] = Field(
        default=None,
        description=(
            "Present when this document had a parseable GPS coordinate. "
            "Absent (null) for documents with no coordinate to check, e.g. "
            "tax_id documents or documents with failed/skipped extraction."
        ),
    )
    plausibility_flags: list[str] = Field(
        default_factory=list,
        description=(
            "Sanity-check warnings (see app/services/plausibility_checker.py) — an extracted "
            "weight wildly outside a plausible range for the stated commodity, or a coordinate "
            "outside the stated country's rough bounding box. These catch confidently-wrong AI "
            "extractions a confidence score alone can miss. Empty list, not absent, when clean."
        ),
    )

    # Manual review state — set via POST /shipments/{id}/documents/{id}/flag
    # and .../resolve-flag (see app.services.document_review_service). Not
    # part of the AI pipeline's own output; always False/null on a
    # freshly-processed document.
    flagged_for_review: bool = Field(
        default=False, description="True once a team member has flagged this document for manual review."
    )
    flag_note: Optional[str] = Field(
        default=None, description="Optional free-text reason the reviewer gave when flagging."
    )
    flagged_at: Optional[str] = Field(default=None, description="ISO 8601 timestamp of when it was flagged.")
    flagged_by: Optional[str] = Field(default=None, description="User ID of who flagged it.")


class FlagDocumentRequest(BaseModel):
    """Request body for POST /shipments/{id}/documents/{id}/flag."""

    note: Optional[str] = Field(
        default=None, max_length=2000, description="Optional reason for flagging this document."
    )
