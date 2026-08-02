"""
Translates a stored `ShipmentUploadResponse` plus a `GenerateDdsXmlRequest`
into the plain-dict shapes `xml_generator.generate_traces_xml` expects.

Kept separate from `xml_generator.py` so that module stays free of any
dependency on our internal Pydantic schemas — this is the one place that
bridges "our domain model" and the XML generator's plain-dict contract.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.core.exceptions import ShipmentNotReadyError
from app.core.logging import get_logger
from app.schemas.responses import ShipmentUploadResponse
from app.schemas.shipment_summary import GenerateDdsXmlRequest

logger = get_logger(__name__)


def build_operator_payload(request: GenerateDdsXmlRequest) -> dict[str, Any]:
    """Build the `operator_data` dict for `generate_traces_xml`."""
    return {
        "name": request.operator_name.strip(),
        "country": request.operator_country.strip(),
        "address": request.operator_address.strip(),
        "email": request.operator_email.strip(),
        "phone": request.operator_phone.strip(),
        "eori": (request.operator_eori or "").strip() or None,
    }


def build_shipment_payload(
    shipment: ShipmentUploadResponse,
    request: GenerateDdsXmlRequest,
) -> dict[str, Any]:
    """
    Build the `shipment_data` dict for `generate_traces_xml` from a stored
    shipment result and the caller-supplied export request.

    Gates on compliance readiness up front: a shipment that hasn't cleared
    both mass balance and satellite verification cannot produce a DDS here
    at all, regardless of what fields are supplied — raises
    `ShipmentNotReadyError` (400) rather than silently generating a
    misleading "negligible risk" statement.
    """
    compliance = shipment.compliance
    mass_balance_passed = compliance.mass_balance.status == "compliant"
    satellite_verification_passed = compliance.critical_farms == 0 and compliance.pending_verification == 0

    if not mass_balance_passed or not satellite_verification_passed:
        reasons: list[str] = []
        if not mass_balance_passed:
            reasons.append(
                f"mass balance is out of tolerance ({compliance.mass_balance.percentage_difference}% "
                f"over the declared weight)"
            )
        if compliance.critical_farms > 0:
            reasons.append(f"{compliance.critical_farms} farm(s) show deforestation after the EUDR cutoff")
        if compliance.pending_verification > 0:
            reasons.append(f"{compliance.pending_verification} plot(s) still have unresolved satellite verification")

        raise ShipmentNotReadyError(
            "This shipment cannot produce a DDS XML yet: " + "; ".join(reasons) + "."
        )

    verified_plots = _extract_verified_plots(shipment, fallback_producer_country=request.country_of_production)

    resolved_description = request.commodity_description or _derive_most_common(shipment, field="commodity")
    if not resolved_description:
        raise ShipmentNotReadyError(
            "Could not automatically determine a commodity description from this shipment's "
            "extracted data. Supply it explicitly via commodity_description."
        )

    return {
        "internal_reference_number": f"CANORY-{shipment.shipment_id[:8].upper()}",
        "operator_type": request.operator_type,
        "activity_type": request.activity_type,
        "country_of_activity": request.country_of_activity,
        "border_cross_country": request.border_cross_country,
        "hs_code": request.hs_code.strip(),
        "commodity_description": resolved_description,
        "net_weight_kg": compliance.mass_balance.declared_weight_kg,
        "plots": verified_plots,
        "geolocation_confidential": request.geolocation_confidential,
        "mass_balance_passed": mass_balance_passed,
        "satellite_verification_passed": satellite_verification_passed,
    }


def _extract_verified_plots(
    shipment: ShipmentUploadResponse, *, fallback_producer_country: str | None
) -> list[dict[str, Any]]:
    """
    Only documents whose satellite verification came back `verified_clean`
    (risk == "low") are included — per spec, missing GPS, invalid
    coordinates, failed extraction, and unresolved/critical verifications
    must never appear in the DDS geolocation section. Each plot carries
    its own producer name/country where the source document has one
    (matching the real schema's per-producer, not per-shipment, country
    field — see xml_generator.py) — falling back to
    `fallback_producer_country` (the request's country_of_production, if
    supplied) only when a document has no country of its own.
    """
    plots: list[dict[str, Any]] = []
    for document in shipment.documents:
        verification = document.satellite_verification
        if verification is None or verification.risk != "low":
            continue
        extracted = document.extracted_data
        producer_country = (extracted.country if extracted else None) or fallback_producer_country
        producer_name = (extracted.farmer_name if extracted else None) or (
            extracted.supplier_name if extracted else None
        )
        plots.append(
            {
                "latitude": verification.latitude,
                "longitude": verification.longitude,
                "producer_country": producer_country,
                "producer_name": producer_name,
                # Carried through purely so a validation failure in
                # xml_generator.py can say "fix land_deed_pereira.pdf",
                # not "fix plots[1]" — a document filename means something
                # to the person reviewing this; an array index doesn't.
                "source_filename": document.filename,
            }
        )
    return plots


def _derive_most_common(shipment: ShipmentUploadResponse, *, field: str) -> str | None:
    """Derive a shipment-level value (e.g. commodity) as the most common
    non-null value for that field across all successfully extracted
    documents. Returns None if no document has a value for this field."""
    values = [
        getattr(document.extracted_data, field)
        for document in shipment.documents
        if document.extracted_data is not None and getattr(document.extracted_data, field, None)
    ]
    if not values:
        return None
    most_common_value, _count = Counter(values).most_common(1)[0]
    return most_common_value
