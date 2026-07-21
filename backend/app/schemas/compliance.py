"""
Compliance Engine schemas: satellite (geospatial) verification, mass
balance validation, and the shipment-level compliance summary that
combines them.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# --- Satellite (geospatial) verification ---

SatelliteVerificationStatus = Literal[
    "verified_clean",
    "forest_loss_detected",
    "verification_pending",
    "api_timeout",
    "unknown",
]

SatelliteRisk = Literal["critical", "low", "unknown"]


class SatelliteVerificationResult(BaseModel):
    """
    Result of checking a single GPS coordinate against Global Forest Watch
    tree cover loss data. Always present when a document had a parseable
    GPS coordinate — a failed or inconclusive check is represented as a
    status/risk value, never omitted or silently dropped.
    """

    latitude: float
    longitude: float
    status: SatelliteVerificationStatus
    risk: SatelliteRisk
    tree_cover_loss_years: list[int] = Field(default_factory=list)
    reason: Optional[str] = None
    cutoff_year: int = 2020


# --- Mass balance validation ---

MassBalanceStatus = Literal["compliant", "mass_balance_mismatch"]
MassBalanceSeverity = Literal["none", "warning", "critical"]


class MassBalanceResult(BaseModel):
    """
    Result of comparing the sum of all extracted receipt weights against
    the shipment's declared weight, within an allowed tolerance.
    """

    declared_weight_kg: float
    extracted_weight_kg: float
    difference_kg: float
    percentage_difference: float
    tolerance_percentage: float
    status: MassBalanceStatus
    severity: MassBalanceSeverity
    suggested_action: str
    documents_included: int
    documents_excluded: int


# --- Shipment-level compliance summary ---

ComplianceReadiness = Literal["ready", "needs_review", "blocked"]


class ComplianceSummary(BaseModel):
    """
    Shipment-wide compliance rollup combining satellite verification
    results across all documents with the mass balance check. This is the
    "Final Compliance Report" produced at the end of the processing
    pipeline.
    """

    readiness: ComplianceReadiness
    critical_farms: int
    verified_farms: int
    pending_verification: int
    percentage_verified: float
    total_coordinates_checked: int
    mass_balance: MassBalanceResult
    plausibility_flag_count: int = Field(
        default=0,
        description=(
            "Number of documents with at least one sanity-check warning (see "
            "app/services/plausibility_checker.py). Greater than zero forces readiness to at "
            "least 'needs_review', regardless of satellite/mass-balance results — a plausible-"
            "looking but wrong extraction should never silently reach 'ready'."
        ),
    )
