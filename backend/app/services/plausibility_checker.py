"""
Sanity-checking for extracted values — catches the class of error a
confidence score can miss entirely: an AI extraction that is *confidently
wrong* (a misread digit, a decimal point in the wrong place, a
transposed coordinate). Neither check here is a precise scientific or
legal determination — they're deliberately generous bounds meant to
catch order-of-magnitude mistakes, not to second-guess a legitimately
unusual but real shipment.

Both checks are permissive by default: an unrecognized commodity or
country is never flagged, since a false "implausible" flag on a real,
correctly-extracted value is worse than missing an occasional genuine
error. The goal is catching obvious mistakes, not blocking anything
outside a known-good set.
"""

from __future__ import annotations

from typing import Final

import pycountry

# ---------------------------------------------------------------------------
# Weight plausibility — generous per-document bounds for the seven EUDR
# commodities. These describe a single supplier document's declared
# weight (one weighbridge receipt, one delivery), not annual production
# volume — bounds are wide enough to cover everything from a smallholder's
# single delivery to a large cooperative or mill's truckload.
# ---------------------------------------------------------------------------
_WEIGHT_RANGES_KG: Final[dict[str, tuple[float, float]]] = {
    "cattle": (10.0, 50_000.0),
    "cocoa": (1.0, 100_000.0),
    "coffee": (1.0, 100_000.0),
    "oil_palm": (1.0, 200_000.0),
    "rubber": (1.0, 100_000.0),
    "soy": (1.0, 500_000.0),
    "wood": (1.0, 500_000.0),
}

# Keyword matching from free-text extracted commodity strings (e.g.
# "green coffee beans", "FFB", "raw cocoa") to the seven canonical EUDR
# commodities above. Deliberately simple substring matching — this only
# needs to be good enough to select the right *bound*, not a legal
# classification (that's what the human-supplied HS code on XML export
# is for; see backend/app/api/v1/shipments.py).
_COMMODITY_KEYWORDS: Final[dict[str, list[str]]] = {
    "cattle": ["cattle", "beef", "livestock", "cow", "bovine"],
    "cocoa": ["cocoa", "cacao"],
    "coffee": ["coffee", "arabica", "robusta"],
    "oil_palm": ["palm oil", "palm fruit", "ffb", "fresh fruit bunch", "oil palm"],
    "rubber": ["rubber", "latex"],
    "soy": ["soy", "soya", "soybean"],
    "wood": ["wood", "timber", "lumber", "log"],
}

# ---------------------------------------------------------------------------
# Coordinate plausibility — rough rectangular bounding boxes (min_lat,
# max_lat, min_lon, max_lon), NOT precise borders. A real border-polygon
# check would need a geo dataset this codebase doesn't have; a bounding
# box is a defensible sanity check ("is this coordinate even on the
# right continent"), not a precise geographic or legal determination.
# Covers major EUDR-relevant sourcing countries — deliberately not
# exhaustive; an unlisted country is never flagged (see module docstring).
# ---------------------------------------------------------------------------
_COUNTRY_BOUNDING_BOXES: Final[dict[str, tuple[float, float, float, float]]] = {
    "brazil": (-33.75, 5.27, -73.99, -34.79),
    "indonesia": (-11.0, 6.08, 95.0, 141.0),
    "colombia": (-4.23, 13.4, -79.0, -66.87),
    "vietnam": (8.18, 23.39, 102.14, 109.46),
    "ivory coast": (4.34, 10.74, -8.6, -2.49),
    "cote d'ivoire": (4.34, 10.74, -8.6, -2.49),
    "ghana": (4.74, 11.17, -3.26, 1.19),
    "ethiopia": (3.4, 14.89, 32.99, 47.99),
    "peru": (-18.35, -0.04, -81.33, -68.65),
    "malaysia": (0.85, 7.36, 99.64, 119.27),
    "india": (6.75, 35.5, 68.11, 97.4),
    "nigeria": (4.27, 13.89, 2.67, 14.68),
    "cameroon": (1.65, 13.08, 8.49, 16.19),
    "democratic republic of congo": (-13.46, 5.39, 12.18, 31.31),
    "papua new guinea": (-11.66, -0.87, 140.84, 159.47),
    "guatemala": (13.74, 17.82, -92.24, -88.19),
    "honduras": (12.98, 16.51, -89.35, -83.13),
    "ecuador": (-5.02, 1.45, -81.08, -75.19),
    "mexico": (14.53, 32.72, -118.4, -86.71),
    "paraguay": (-27.6, -19.29, -62.64, -54.26),
    "argentina": (-55.06, -21.78, -73.58, -53.63),
    "uganda": (-1.48, 4.23, 29.57, 35.03),
    "liberia": (4.35, 8.55, -11.49, -7.37),
    "myanmar": (9.78, 28.55, 92.19, 101.18),
    "thailand": (5.61, 20.46, 97.34, 105.64),
    "sri lanka": (5.92, 9.84, 79.65, 81.88),
}


def normalize_commodity(raw: str | None) -> str | None:
    if not raw:
        return None
    lowered = raw.lower()
    for canonical, keywords in _COMMODITY_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return canonical
    return None


def normalize_country(raw: str | None) -> str | None:
    if not raw:
        return None
    lowered = raw.strip().lower()
    if lowered in _COUNTRY_BOUNDING_BOXES:
        return lowered
    for known_country in _COUNTRY_BOUNDING_BOXES:
        if known_country in lowered or lowered in known_country:
            return known_country
    return None


def check_weight_plausibility(commodity: str | None, weight_kg: float | None) -> str | None:
    """Returns a human-readable flag if `weight_kg` is wildly outside a
    plausible range for the (best-guess) commodity, else None."""
    if weight_kg is None or weight_kg <= 0:
        return None

    canonical = normalize_commodity(commodity)
    if canonical is None:
        return None

    min_kg, max_kg = _WEIGHT_RANGES_KG[canonical]
    if weight_kg < min_kg or weight_kg > max_kg:
        return (
            f"Extracted weight {weight_kg:,.0f}kg is outside the plausible range for "
            f"{canonical.replace('_', ' ')} ({min_kg:,.0f}-{max_kg:,.0f}kg) — verify this wasn't "
            f"an extraction error (e.g. a misplaced decimal point) before treating it as correct."
        )
    return None


def check_country_validity(country: str | None) -> str | None:
    """
    Returns a human-readable flag if `country` doesn't correspond to any
    real country at all — using the full, authoritative ISO 3166-1
    dataset (via `pycountry`), not the small hand-rolled list
    `normalize_country`/`_COUNTRY_BOUNDING_BOXES` use for the (much more
    permissive, deliberately narrower) coordinate-bounding-box check
    below.

    This is meaningfully different from, and doesn't contradict, this
    module's general "don't flag an unrecognized value" philosophy: a
    real country that simply isn't in the short bounding-box list (most
    of the world's ~195 countries aren't) is correctly never flagged
    here either — `pycountry` recognizes it fine. What this catches is
    values that aren't a real country under any reasonable
    interpretation at all — "International waters" is the real,
    observed case that motivated this (a deliberately-invalid test
    document's country flowed silently all the way through to DDS
    generation before erroring there, far later than a person reviewing
    the document would want to find out). Surfacing this as a
    plausibility flag at extraction time, not only as a hard failure
    when someone tries to generate a DDS weeks later, is the actual fix.
    """
    if not country or not country.strip():
        return None
    raw = country.strip()

    if len(raw) == 2 and pycountry.countries.get(alpha_2=raw.upper()):
        return None
    try:
        pycountry.countries.lookup(raw)
        return None
    except LookupError:
        return (
            f"Extracted country '{country}' does not match any real ISO 3166-1 country — verify "
            f"this document's country wasn't misread, and note that a DDS cannot be generated "
            f"for a plot with an unresolvable country until this is corrected."
        )


def check_coordinate_plausibility(country: str | None, latitude: float, longitude: float) -> str | None:
    """Returns a human-readable flag if (latitude, longitude) falls well
    outside the stated country's rough bounding box, else None."""
    canonical = normalize_country(country)
    if canonical is None:
        return None

    min_lat, max_lat, min_lon, max_lon = _COUNTRY_BOUNDING_BOXES[canonical]
    if not (min_lat <= latitude <= max_lat and min_lon <= longitude <= max_lon):
        return (
            f"Extracted coordinates ({latitude:.4f}, {longitude:.4f}) fall outside the expected "
            f"area for the stated country of production ({country}) — verify the coordinates "
            f"weren't misread or transposed (latitude/longitude swapped is a common error)."
        )
    return None
