"""
GPS coordinate parsing utility.

`ExtractedData.gps_coordinates` is free-form text produced by Gemini's
vision extraction (e.g. "-1.2921, 36.8219", "1.2921° S, 36.8219° E"), not a
structured lat/lng pair. This module turns that text into a validated
`(latitude, longitude)` tuple the geospatial service can act on, and is the
single place that decides whether a coordinate string is usable at all.
"""

from __future__ import annotations

import re
from typing import Final

from app.core.exceptions import InvalidCoordinateError
from app.core.logging import get_logger

logger = get_logger(__name__)

_LATITUDE_RANGE: Final[tuple[float, float]] = (-90.0, 90.0)
_LONGITUDE_RANGE: Final[tuple[float, float]] = (-180.0, 180.0)

# Matches a single signed decimal number, optionally followed by a degree
# symbol and/or a hemisphere letter (N/S/E/W), e.g.:
#   "-1.2921"        "1.2921°"        "1.2921° S"        "36.8219 E"
_COORDINATE_TOKEN_RE = re.compile(
    r"(?P<sign>[-+])?\s*(?P<value>\d{1,3}(?:\.\d+)?)\s*°?\s*(?P<hemisphere>[NSEWnsew])?",
)


def parse_gps_coordinates(raw: str | None) -> tuple[float, float]:
    """
    Parse a free-text GPS string into a `(latitude, longitude)` tuple.

    Raises `InvalidCoordinateError` if the string is empty, doesn't contain
    exactly two coordinate values, or the resulting values fall outside
    valid latitude/longitude ranges. Never returns a partially-valid result
    — compliance decisions downstream depend on this being all-or-nothing.
    """
    if raw is None or not raw.strip():
        raise InvalidCoordinateError("No GPS coordinates were provided.")

    tokens = [match for match in _COORDINATE_TOKEN_RE.finditer(raw) if match.group("value")]

    if len(tokens) != 2:
        raise InvalidCoordinateError(
            f"Could not parse exactly two coordinate values from '{raw}'."
        )

    try:
        latitude = _token_to_signed_value(tokens[0], default_negative_hemispheres="SW")
        longitude = _token_to_signed_value(tokens[1], default_negative_hemispheres="SW")
    except ValueError as exc:
        raise InvalidCoordinateError(f"Malformed coordinate value in '{raw}': {exc}") from exc

    if not (_LATITUDE_RANGE[0] <= latitude <= _LATITUDE_RANGE[1]):
        raise InvalidCoordinateError(
            f"Latitude {latitude} is outside the valid range {_LATITUDE_RANGE} (parsed from '{raw}')."
        )
    if not (_LONGITUDE_RANGE[0] <= longitude <= _LONGITUDE_RANGE[1]):
        raise InvalidCoordinateError(
            f"Longitude {longitude} is outside the valid range {_LONGITUDE_RANGE} (parsed from '{raw}')."
        )

    return latitude, longitude


def _token_to_signed_value(match: re.Match[str], *, default_negative_hemispheres: str) -> float:
    value = float(match.group("value"))
    sign = match.group("sign")
    hemisphere = (match.group("hemisphere") or "").upper()

    if hemisphere:
        if hemisphere in default_negative_hemispheres:
            value = -abs(value)
        else:
            value = abs(value)
    elif sign == "-":
        value = -value

    return value


def coordinate_cache_key(latitude: float, longitude: float, precision: int = 6) -> tuple[float, float]:
    """
    Round a coordinate pair to a fixed precision for deduplication purposes.

    Six decimal places (~0.11 m at the equator) is far finer than GPS or OCR
    accuracy can justify, so rounding here only merges coordinates that are
    effectively identical — it never merges genuinely distinct farms. Used
    to avoid firing duplicate Global Forest Watch requests for receipts that
    share the same plot.
    """
    return round(latitude, precision), round(longitude, precision)
