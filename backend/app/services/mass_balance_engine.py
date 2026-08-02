"""
Mass balance validation engine.

Compares the sum of all successfully-extracted receipt weights against a
shipment's declared weight, flagging over-reporting beyond an allowed
tolerance. Kept as a pure, side-effect-free function so it's trivially
testable in isolation from the rest of the processing pipeline.
"""

from __future__ import annotations

from app.core.logging import get_logger
from app.schemas.compliance import MassBalanceResult
from app.schemas.documents import DocumentResult

logger = get_logger(__name__)


def compute_mass_balance(
    declared_weight_kg: float,
    documents: list[DocumentResult],
    tolerance_fraction: float,
) -> MassBalanceResult:
    """
    Sum `crop_weight_kg` across all documents with valid extracted weights
    (ignoring null, invalid, and non-positive values), compare it to the
    declared shipment weight within `tolerance_fraction`, and return a
    fully-populated `MassBalanceResult`.
    """
    extracted_weight_kg = 0.0
    documents_included = 0
    documents_excluded = 0

    for document in documents:
        weight = document.extracted_data.crop_weight_kg if document.extracted_data else None

        if weight is None or not isinstance(weight, (int, float)) or weight <= 0:
            if document.extracted_data is not None:
                # Only count as "excluded" if this document actually had an
                # extraction attempt with a weight field to evaluate at all
                # (a tax_id or skipped document never had a weight to begin
                # with, so it's not a meaningful exclusion).
                documents_excluded += 1
            continue

        extracted_weight_kg += weight
        documents_included += 1

    maximum_allowed_weight_kg = declared_weight_kg * (1 + tolerance_fraction)
    difference_kg = extracted_weight_kg - declared_weight_kg
    percentage_difference = (
        (difference_kg / declared_weight_kg) * 100 if declared_weight_kg > 0 else 0.0
    )

    is_mismatch = extracted_weight_kg > maximum_allowed_weight_kg

    if is_mismatch:
        status: str = "mass_balance_mismatch"
        # A moderate overage (up to 3x the tolerance band) is a warning
        # worth a human look; beyond that is treated as critical — likely
        # fraudulent over-reporting rather than measurement noise.
        severity = "critical" if percentage_difference > tolerance_fraction * 100 * 3 else "warning"
        suggested_action = (
            f"Extracted weight ({extracted_weight_kg:,.1f} kg) exceeds the declared "
            f"weight ({declared_weight_kg:,.1f} kg) by {percentage_difference:.1f}%, "
            f"beyond the {tolerance_fraction * 100:.0f}% tolerance. Review the flagged "
            "receipts for duplicate or over-stated weights before customs submission."
        )
        logger.warning(
            "Mass balance mismatch: declared=%.2f kg, extracted=%.2f kg, diff=%.2f%% (severity=%s).",
            declared_weight_kg,
            extracted_weight_kg,
            percentage_difference,
            severity,
        )
    else:
        status = "compliant"
        severity = "none"
        suggested_action = "No action needed — extracted weight is within the declared tolerance."
        logger.info(
            "Mass balance compliant: declared=%.2f kg, extracted=%.2f kg, diff=%.2f%%.",
            declared_weight_kg,
            extracted_weight_kg,
            percentage_difference,
        )

    return MassBalanceResult(
        declared_weight_kg=declared_weight_kg,
        extracted_weight_kg=round(extracted_weight_kg, 3),
        difference_kg=round(difference_kg, 3),
        percentage_difference=round(percentage_difference, 2),
        tolerance_percentage=tolerance_fraction * 100,
        status=status,  # type: ignore[arg-type]
        severity=severity,  # type: ignore[arg-type]
        suggested_action=suggested_action,
        documents_included=documents_included,
        documents_excluded=documents_excluded,
    )
