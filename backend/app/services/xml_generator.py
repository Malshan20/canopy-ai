"""
EUDR Due Diligence Statement (DDS) content generation.

Produces the DDS `statement` data structure — content-accurate to the
real EUDR TRACES NT submission schema — serialized as XML for download
and review.

--------------------------------------------------------------------------
WHAT "ACCURATE" MEANS HERE, PRECISELY (read before assuming this is a
guaranteed-acceptable TRACES NT submission — it is not, and cannot
honestly claim to be without real TRACES credentials to verify against)
--------------------------------------------------------------------------
TRACES NT does not accept an uploaded XML file at all — real submission
is a SOAP web service call (EUDRSubmissionServiceV1/V2), authenticated
with a real operator's TRACES username/password, to one of two real
endpoints:
  - Acceptance/test: https://acceptance.eudr.webcloud.ec.europa.eu/tracesnt/
  - Production:      https://eudr.webcloud.ec.europa.eu/tracesnt/
This module has never been tested against either, because CanoryAI does
not hold TRACES credentials for any operator. What IS verified: the
*data structure* below (operatorType, statement.activityType,
countryOfActivity, borderCrossCountry, commodities[], producers[] with
base64-encoded geometryGeojson, geoLocationConfidential, etc.) is
cross-checked against a real, production-tested, XSD-schema-derived open
source EUDR API client (mfrntic/eudr-api-client, AGPL-licensed, 19
stars — its own README documents the exact field names, nesting, and
per-activity-type validation rules this module mirrors). That replaced
an earlier version of this module built from general assumption, which
used a different, unverified schema entirely — a real, embarrassing gap
that a direct customer-provided example XML surfaced.

So: this is now the DDS *content*, structurally accurate to the real
schema, serialized as XML for a compliance officer to review — not proof
of SOAP-level wire compatibility (element casing/ordering at the SOAP
envelope level isn't independently confirmed without the actual WSDL/XSD
files), and not a submission mechanism. Real submission requires building
a SOAP client with WS-Security against real TRACES credentials — tracked
as separate, larger, not-yet-started work. Every place this module's
output is surfaced to a user must say exactly that.

XML is built exclusively with `xml.etree.ElementTree` (never string
concatenation or f-string-assembled markup) and pretty-printed via
`xml.dom.minidom`.
"""

from __future__ import annotations

import base64
import json
import re
import xml.etree.ElementTree as ET
from typing import Any, Final
from xml.dom import minidom

import pycountry

from app.core.exceptions import DdsValidationError, XmlGenerationError
from app.core.logging import get_logger

logger = get_logger(__name__)

# Real, valid values per the DDS schema (mfrntic/eudr-api-client's
# documented Data Types — cross-checked, not assumed).
VALID_OPERATOR_TYPES: Final[tuple[str, ...]] = ("OPERATOR", "TRADER")
VALID_ACTIVITY_TYPES: Final[tuple[str, ...]] = ("TRADE", "IMPORT", "EXPORT", "DOMESTIC")

_REQUIRED_OPERATOR_FIELDS: Final[tuple[str, ...]] = ("name", "country", "address", "email", "phone")
_REQUIRED_SHIPMENT_FIELDS: Final[tuple[str, ...]] = (
    "activity_type",
    "country_of_activity",
    "border_cross_country",
    "hs_code",
    "commodity_description",
    "net_weight_kg",
    "plots",
    "geolocation_confidential",
    "mass_balance_passed",
    "satellite_verification_passed",
)


def generate_traces_xml(shipment_data: dict[str, Any], operator_data: dict[str, Any]) -> str:
    """
    Generate a pretty-printed XML document representing a DDS `statement`,
    structurally accurate to the real EUDR TRACES NT schema (see this
    module's docstring for exactly what that does and doesn't mean).

    Args:
        shipment_data: Must contain:
            - internal_reference_number (str): CanoryAI's own tracking
              reference — explicitly NOT a TRACES-issued reference number,
              which only exists after a real submission succeeds.
            - activity_type (str): One of VALID_ACTIVITY_TYPES.
            - country_of_activity (str): ISO country code.
            - border_cross_country (str): ISO country code.
            - hs_code (str), commodity_description (str), net_weight_kg (float).
            - plots (list[dict]): Verified plots, each with "latitude",
              "longitude", and optionally "producer_name" /
              "producer_country". Only successfully verified, valid
              coordinates should be included by the caller.
            - geolocation_confidential (bool).
            - mass_balance_passed (bool), satellite_verification_passed (bool).
        operator_data: Must contain name, country, address, email, phone,
            and optionally eori.

    Returns:
        A complete, pretty-printed XML document string.

    Raises:
        XmlGenerationError: on any missing/malformed field, or if a
            shipment hasn't passed both compliance checks.
    """
    root = build_dds_element(shipment_data, operator_data)
    try:
        xml_string = _serialize_pretty(root)
    except (DdsValidationError, XmlGenerationError):
        raise
    except Exception as exc:  # noqa: BLE001 - convert any serialization failure to our own error type
        logger.error("XML generation failed unexpectedly: %s", exc)
        raise XmlGenerationError(f"Unexpected error while generating DDS XML: {exc}") from exc
    return xml_string


def build_dds_element(shipment_data: dict[str, Any], operator_data: dict[str, Any]) -> ET.Element:
    """
    The same DDS content `generate_traces_xml` produces, as a raw
    `ET.Element` rather than a pretty-printed string — used by
    `traces_soap_client.submit_dds_to_traces` to embed directly in a SOAP
    envelope without the wasteful (and slightly fragile, given
    pretty-printing's extra whitespace text nodes) round-trip of
    serializing to a string and re-parsing it. `generate_traces_xml`
    itself is a thin wrapper around this function plus
    `_serialize_pretty` — one real implementation, two output shapes for
    two real callers, not two implementations that could drift apart.

    See `generate_traces_xml`'s docstring for the full argument and
    validation contract; identical here.
    """
    _validate_required_fields(operator_data, _REQUIRED_OPERATOR_FIELDS, context="operator_data")
    _validate_required_fields(shipment_data, _REQUIRED_SHIPMENT_FIELDS, context="shipment_data")

    activity_type = str(shipment_data["activity_type"]).strip().upper()
    if activity_type not in VALID_ACTIVITY_TYPES:
        raise DdsValidationError(
            f"shipment_data.activity_type must be one of {VALID_ACTIVITY_TYPES}, got {activity_type!r}."
        )

    if not shipment_data["mass_balance_passed"] or not shipment_data["satellite_verification_passed"]:
        # Defensive: callers are expected to gate this before calling in at
        # all, but a DDS asserting "negligible risk" must never be
        # generated for a shipment that hasn't actually passed both
        # checks, so this function refuses on principle even if a caller
        # forgets to gate.
        raise DdsValidationError(
            "Cannot generate a DDS for a shipment that has not passed both "
            "mass balance and satellite verification."
        )

    operator_type = str(shipment_data.get("operator_type", "OPERATOR")).strip().upper()
    if operator_type not in VALID_OPERATOR_TYPES:
        raise DdsValidationError(
            f"shipment_data.operator_type must be one of {VALID_OPERATOR_TYPES}, got {operator_type!r}."
        )

    try:
        root = ET.Element("DdsSubmissionRequest")
        ET.SubElement(root, "operatorType").text = operator_type

        statement_el = ET.SubElement(root, "statement")
        _build_reference_section(statement_el, shipment_data)
        _build_operator_section(statement_el, operator_data)
        _build_activity_section(statement_el, shipment_data)
        _build_commodity_section(statement_el, shipment_data)
        plot_count = _build_producers_section(statement_el, shipment_data["plots"])
        ET.SubElement(statement_el, "geoLocationConfidential").text = str(
            bool(shipment_data["geolocation_confidential"])
        ).lower()
    except (DdsValidationError, XmlGenerationError):
        raise
    except Exception as exc:  # noqa: BLE001 - convert any element-building failure to our own error type
        logger.error("DDS element construction failed unexpectedly: %s", exc)
        raise XmlGenerationError(f"Unexpected error while building DDS content: {exc}") from exc

    logger.info(
        "Built DDS content for operator '%s' (activityType=%s, hsCode=%s, plots=%d).",
        operator_data["name"],
        activity_type,
        shipment_data["hs_code"],
        plot_count,
    )
    return root


def _validate_required_fields(data: dict[str, Any], required_fields: tuple[str, ...], *, context: str) -> None:
    if not isinstance(data, dict):
        raise DdsValidationError(f"{context} must be a dict, got {type(data).__name__}.")

    missing = [field for field in required_fields if field not in data or data[field] in (None, "")]
    if missing:
        raise DdsValidationError(f"Missing required field(s) in {context}: {', '.join(missing)}.")


def _build_reference_section(statement_el: ET.Element, shipment_data: dict[str, Any]) -> None:
    ref = str(shipment_data.get("internal_reference_number", "")).strip()
    if not ref:
        raise DdsValidationError("shipment_data.internal_reference_number cannot be empty.")
    ref_el = ET.SubElement(statement_el, "internalReferenceNumber")
    ref_el.text = ref
    ref_el.set("note", "CanoryAI-assigned tracking reference — not a TRACES-issued DDS reference number.")


def _build_operator_section(statement_el: ET.Element, operator_data: dict[str, Any]) -> None:
    operator_el = ET.SubElement(statement_el, "operator")
    address_el = ET.SubElement(operator_el, "nameAndAddress")
    ET.SubElement(address_el, "name").text = str(operator_data["name"]).strip()
    ET.SubElement(address_el, "country").text = str(operator_data["country"]).strip().upper()
    ET.SubElement(address_el, "address").text = str(operator_data["address"]).strip()

    ET.SubElement(operator_el, "email").text = str(operator_data["email"]).strip()
    ET.SubElement(operator_el, "phone").text = str(operator_data["phone"]).strip()

    eori = str(operator_data.get("eori") or "").strip()
    if eori:
        ref_number_el = ET.SubElement(operator_el, "referenceNumber")
        ET.SubElement(ref_number_el, "identifierType").text = "eori"
        ET.SubElement(ref_number_el, "identifierValue").text = eori


def _build_activity_section(statement_el: ET.Element, shipment_data: dict[str, Any]) -> None:
    ET.SubElement(statement_el, "activityType").text = str(shipment_data["activity_type"]).strip().upper()
    ET.SubElement(statement_el, "countryOfActivity").text = str(shipment_data["country_of_activity"]).strip().upper()
    ET.SubElement(statement_el, "borderCrossCountry").text = str(shipment_data["border_cross_country"]).strip().upper()


def _build_commodity_section(statement_el: ET.Element, shipment_data: dict[str, Any]) -> None:
    hs_code = str(shipment_data["hs_code"]).strip()
    description = str(shipment_data["commodity_description"]).strip()

    if not hs_code:
        raise DdsValidationError("shipment_data.hs_code cannot be empty.")
    if not description:
        raise DdsValidationError("shipment_data.commodity_description cannot be empty.")

    try:
        net_weight_kg = float(shipment_data["net_weight_kg"])
    except (TypeError, ValueError) as exc:
        raise DdsValidationError(
            f"shipment_data.net_weight_kg must be numeric, got {shipment_data['net_weight_kg']!r}."
        ) from exc
    if net_weight_kg <= 0:
        raise DdsValidationError("shipment_data.net_weight_kg must be greater than 0.")

    commodities_el = ET.SubElement(statement_el, "commodities")
    commodity_el = ET.SubElement(commodities_el, "commodity")
    descriptors_el = ET.SubElement(commodity_el, "descriptors")
    ET.SubElement(descriptors_el, "descriptionOfGoods").text = description

    goods_measure_el = ET.SubElement(descriptors_el, "goodsMeasure")
    # netWeight (kg) is the one universally-required measure for IMPORT
    # activities regardless of HS code (see this module's docstring) —
    # supplementaryUnit is only mandatory for a specific set of wood-HS
    # codes (Appendix I) not relevant to the non-wood commodities
    # CanoryAI's actual customer base imports (cocoa, coffee, palm oil,
    # soy, cattle, rubber), so it's deliberately not implemented here yet.
    ET.SubElement(goods_measure_el, "netWeight").text = f"{net_weight_kg:.3f}"

    ET.SubElement(commodity_el, "hsHeading").text = hs_code
    return commodity_el


def _plot_label(plot: Any, index: int) -> str:
    """
    A human-meaningful reference to a plot for error messages — the
    source document's filename if the caller supplied one (see
    xml_data_builder.py's `_extract_verified_plots`), falling back to
    the bare index only for callers that don't have a filename to give
    (e.g. a direct API caller building shipment_data by hand). "Fix
    land_deed_pereira.pdf" is something a person reviewing a shipment can
    act on immediately; "fix plots[1]" made someone ask what that even
    meant — a real, reported case, not a hypothetical one.
    """
    filename = plot.get("source_filename") if isinstance(plot, dict) else None
    return f"'{filename}'" if filename else f"plots[{index}]"


def _build_producers_section(statement_el: ET.Element, plots: list[dict[str, Any]]) -> int:
    if not isinstance(plots, list):
        raise DdsValidationError(f"shipment_data.plots must be a list, got {type(plots).__name__}.")
    if not plots:
        raise DdsValidationError("shipment_data.plots cannot be empty — a DDS needs at least one verified plot.")

    # Locate the single <commodity> already built by _build_commodity_section
    # so producers nest correctly under it, per the real schema's
    # commodities[].producers[] structure.
    commodity_el = statement_el.find("commodities/commodity")
    if commodity_el is None:
        raise XmlGenerationError("Internal error: commodity section must be built before producers.")
    producers_el = ET.SubElement(commodity_el, "producers")

    validated_count = 0
    for index, plot in enumerate(plots):
        label = _plot_label(plot, index)
        if not isinstance(plot, dict) or "latitude" not in plot or "longitude" not in plot:
            raise DdsValidationError(f"Document {label} must have 'latitude' and 'longitude'.")
        try:
            latitude = float(plot["latitude"])
            longitude = float(plot["longitude"])
        except (TypeError, ValueError) as exc:
            raise DdsValidationError(f"Document {label} has non-numeric coordinates: {plot!r}.") from exc
        if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
            raise DdsValidationError(
                f"Document {label} has coordinates out of range: lat={latitude}, lon={longitude}."
            )

        producer_el = ET.SubElement(producers_el, "producer")
        raw_country = str(plot.get("producer_country") or "").strip()
        producer_country = _normalize_country_code(raw_country)
        if producer_country is None:
            # Two real, distinct, observed cases land here, both handled
            # by the same message: (1) a document had a country, but it
            # wasn't a real one ("International waters" — a deliberately
            # invalid test document); (2) a document had NO country at
            # all (raw_country is empty) and the caller supplied no
            # fallback either (GenerateDdsXmlRequest.country_of_production
            # — see the DDS export dialog's "Default country of
            # production" field) — a real, reported case: a due
            # diligence statement document type, whose extraction schema
            # doesn't collect "country" at all (see
            # gemini_extractor.py's prompt, rule 10), reaching here with
            # producer_country == "" and no fallback filled in. Either
            # way, silently guessing at a country is worse than saying
            # exactly what's missing and where.
            reason = "isn't a real country" if raw_country else "has no country at all, and no fallback was supplied"
            raise DdsValidationError(
                f"Document {label} has a producer country ({raw_country!r}) that {reason}. Fix this "
                f"document's extracted country, or fill in \"Default country of production\" when "
                f"generating this DDS."
            )
        ET.SubElement(producer_el, "country").text = producer_country
        ET.SubElement(producer_el, "name").text = str(plot.get("producer_name") or "").strip() or "—"
        # geometryGeojson MUST be base64-encoded GeoJSON — confirmed
        # against the real schema; the previous version of this module
        # embedded raw/XML-escaped GeoJSON text here, which does not
        # match the real required encoding.
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "properties": {},
                }
            ],
        }
        geojson_b64 = base64.b64encode(json.dumps(geojson).encode("utf-8")).decode("ascii")
        ET.SubElement(producer_el, "geometryGeojson").text = geojson_b64
        validated_count += 1

    return validated_count


def _normalize_country_code(raw: str) -> str | None:
    """
    Resolve a country name or code to a real ISO 3166-1 alpha-2 code
    using `pycountry` (the standard, maintained ISO 3166 dataset — not a
    hand-rolled mapping that would itself need to be kept accurate).
    Returns None if `raw` can't be matched to a real country at all
    (e.g. "International waters" — a real, observed case that must fail
    loudly rather than be silently passed through, per this function's
    caller).
    """
    if not raw:
        return None
    if re.fullmatch(r"[A-Za-z]{2}", raw):
        # Already looks like a 2-letter code — confirm it's real rather
        # than trust it blindly (a wrong-but-2-letter value, e.g. a typo,
        # should fail the same way an unmappable name would).
        match = pycountry.countries.get(alpha_2=raw.upper())
        return match.alpha_2 if match else None
    try:
        return pycountry.countries.lookup(raw).alpha_2
    except LookupError:
        return None


def _serialize_pretty(root: ET.Element) -> str:
    """Serialize an ElementTree root to a pretty-printed XML string with declaration."""
    raw_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=False)
    parsed = minidom.parseString(raw_bytes)
    pretty_bytes = parsed.toprettyxml(indent="  ", encoding="UTF-8")

    # minidom.toprettyxml is well-known to emit spurious blank lines between
    # elements; strip them so the output is clean, deterministic XML.
    pretty_text = pretty_bytes.decode("utf-8")
    non_blank_lines = [line for line in pretty_text.splitlines() if line.strip()]
    return "\n".join(non_blank_lines) + "\n"
