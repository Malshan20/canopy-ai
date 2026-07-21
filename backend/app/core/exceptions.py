"""
Custom exception hierarchy and global FastAPI exception handlers.

All domain-specific errors inherit from `CustomsTreeError` so they can be
caught, logged, and translated into consistent, safe HTTP responses without
ever leaking internal stack traces or implementation details to API
consumers.
"""

from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.core.logging import get_logger

logger = get_logger(__name__)


class CustomsTreeError(Exception):
    """Base class for all domain-specific, intentionally-raised errors."""

    http_status: int = status.HTTP_400_BAD_REQUEST
    default_message: str = "An unexpected error occurred."

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


# --- Upload / ZIP validation errors ---


class InvalidUploadError(CustomsTreeError):
    http_status = status.HTTP_400_BAD_REQUEST
    default_message = "The uploaded file is invalid."


class ZipTooLargeError(CustomsTreeError):
    http_status = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_message = "The uploaded ZIP archive exceeds the maximum allowed size."


class EmptyZipError(CustomsTreeError):
    http_status = status.HTTP_400_BAD_REQUEST
    default_message = "The uploaded ZIP archive contains no supported documents."


class CorruptedZipError(CustomsTreeError):
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_message = "The uploaded ZIP archive is corrupted or unreadable."


class UnsafeZipContentError(CustomsTreeError):
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_message = "The ZIP archive contains unsafe or disallowed paths."


class TooManyFilesError(CustomsTreeError):
    http_status = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_message = "The ZIP archive contains too many files."


# --- AI provider errors ---


class ClassificationServiceError(CustomsTreeError):
    http_status = status.HTTP_502_BAD_GATEWAY
    default_message = "Document classification service failed."


class ExtractionServiceError(CustomsTreeError):
    http_status = status.HTTP_502_BAD_GATEWAY
    default_message = "Vision extraction service failed."


class UpstreamRateLimitError(CustomsTreeError):
    http_status = status.HTTP_429_TOO_MANY_REQUESTS
    default_message = "An upstream AI provider rate limit was reached."


class UpstreamTimeoutError(CustomsTreeError):
    http_status = status.HTTP_504_GATEWAY_TIMEOUT
    default_message = "An upstream AI provider timed out."


# --- Compliance Engine errors (geospatial + mass balance) ---


class InvalidCoordinateError(CustomsTreeError):
    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_message = "The provided GPS coordinates are invalid or could not be parsed."


class GeospatialServiceError(CustomsTreeError):
    http_status = status.HTTP_502_BAD_GATEWAY
    default_message = "The satellite verification service failed."


class InvalidShipmentDataError(CustomsTreeError):
    http_status = status.HTTP_400_BAD_REQUEST
    default_message = "The shipment data provided is invalid."


class DocumentNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No document was found with this ID in this shipment."


class DocumentHasNoCoordinatesError(CustomsTreeError):
    http_status = status.HTTP_400_BAD_REQUEST
    default_message = "This document has no GPS coordinate to verify against satellite imagery."


# --- Phase 4: EUDR Due Diligence Statement (DDS) generation errors ---


class ShipmentNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No processed shipment was found with this ID."


class ShipmentNotReadyError(CustomsTreeError):
    http_status = status.HTTP_400_BAD_REQUEST
    default_message = (
        "This shipment does not meet the compliance requirements for DDS generation."
    )


class ExportApprovalRequiredError(CustomsTreeError):
    http_status = status.HTTP_403_FORBIDDEN
    default_message = (
        "This organization requires a compliance officer's explicit sign-off before a "
        "shipment's XML can be exported. Approve this shipment first."
    )


class XmlGenerationError(CustomsTreeError):
    """
    A genuinely unexpected internal failure while building or serializing
    a DDS — an ElementTree bug, a logic-ordering error, something that
    shouldn't happen regardless of what data was supplied. For "the data
    supplied can't be turned into a valid DDS" (an invalid country, a
    missing field, an empty plot list — all real, expected, caller-
    fixable situations, not this application malfunctioning), see
    `DdsValidationError` instead — a bare 500 for both was actively
    misleading: it read as "the server is broken" for cases that were
    actually the system correctly catching bad input and explaining
    exactly what to fix.
    """

    http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_message = "Failed to generate the EUDR DDS XML document."


class DdsValidationError(CustomsTreeError):
    """
    The supplied shipment or operator data can't produce a valid DDS —
    a missing required field, an invalid country/activity type, an empty
    plot list, an unresolvable producer country, etc. A 422 (the request
    was well-formed but the data it describes can't be processed), not a
    500 — this is the system working correctly and telling the caller
    exactly what to fix, not an application failure.
    """

    http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
    default_message = "The supplied data can't be used to generate a DDS."


class TracesNotConfiguredError(CustomsTreeError):
    """
    Raised when real TRACES NT submission is attempted without real
    credentials configured (see Settings.TRACES_USERNAME /
    TRACES_AUTHENTICATION_KEY's docstrings for exactly how to obtain
    them — a real EU registration process, not something any code can
    substitute for).
    """

    http_status = status.HTTP_501_NOT_IMPLEMENTED
    default_message = (
        "Real TRACES NT submission is not configured for this organization. This requires real "
        "credentials from the European Commission's own registration process — see the deployment "
        "documentation for exactly how to obtain them."
    )


class TracesSubmissionError(CustomsTreeError):
    """
    Raised when TRACES NT itself rejects a submission — a real SOAP
    Fault, or an HTTP-level failure calling their system. A 502 (Bad
    Gateway) since the failure is upstream, at TRACES NT, not in this
    application.
    """

    http_status = status.HTTP_502_BAD_GATEWAY
    default_message = "TRACES NT rejected the submission."


# --- Phase 5: Audit Vault errors ---


class AuditTrailUnavailableError(CustomsTreeError):
    http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    default_message = "The audit trail could not be retrieved right now. Please try again shortly."


class ReviewWorkflowUnavailableError(CustomsTreeError):
    http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    default_message = (
        "The review workflow's database table is unavailable. If this deployment is new, "
        "its database migration ('alembic upgrade head') has likely not run yet."
    )


# --- Phase 6: Authentication & multi-tenancy errors ---


class MissingCredentialsError(CustomsTreeError):
    http_status = status.HTTP_401_UNAUTHORIZED
    default_message = "Missing or malformed Authorization header. Expected: Bearer <token>."


class InvalidTokenError(CustomsTreeError):
    http_status = status.HTTP_401_UNAUTHORIZED
    default_message = "The provided access token is invalid or expired."


class NoOrganizationError(CustomsTreeError):
    http_status = status.HTTP_403_FORBIDDEN
    default_message = "This account is not a member of any organization."


class InsufficientRoleError(CustomsTreeError):
    http_status = status.HTTP_403_FORBIDDEN
    default_message = "Your role does not permit this action."


class RateLimitExceededError(CustomsTreeError):
    http_status = status.HTTP_429_TOO_MANY_REQUESTS
    default_message = "API rate limit exceeded. Please slow down and try again shortly."


class QuotaExceededError(CustomsTreeError):
    http_status = status.HTTP_403_FORBIDDEN
    default_message = "Your organization's plan shipment limit has been reached for this year."


class PlanRestrictedError(CustomsTreeError):
    http_status = status.HTTP_403_FORBIDDEN
    default_message = "This feature isn't included in your organization's current plan."


class DemoExpiredError(CustomsTreeError):
    """
    Raised for every authenticated request once a demo organization's
    7-day window has passed — see app/core/auth.py's
    `_check_demo_not_expired`, which enforces this on every request, not
    just at login. A 403: the credential is genuinely valid, the account
    just isn't allowed to act anymore.
    """

    http_status = status.HTTP_403_FORBIDDEN
    default_message = (
        "Your demo period has ended. Contact sales to continue using CanoryAI or start a full plan."
    )


# --- Exception handlers (registered in main.py) ---


async def customstree_exception_handler(request: Request, exc: CustomsTreeError) -> JSONResponse:
    """Translate known domain exceptions into safe, structured JSON responses."""
    logger.warning("Handled domain error on %s: %s", request.url.path, exc.message)
    return JSONResponse(
        status_code=exc.http_status,
        content={"error": exc.__class__.__name__, "detail": exc.message},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all handler that never leaks stack traces or internals to the client.

    CORS note — this matters more than it looks: handlers registered for
    the bare `Exception` class run in Starlette's `ServerErrorMiddleware`,
    which wraps *outside* `CORSMiddleware` in the middleware stack. A 500
    produced here therefore never passes through CORS and would go out
    with no `Access-Control-Allow-Origin` header — so the browser blocks
    the response and JavaScript sees only an opaque "network error",
    indistinguishable from the API being down. (Handled domain errors via
    `customstree_exception_handler` don't have this problem; those run
    inside the stack.) To keep unhandled 500s *readable* by the frontend,
    this handler re-applies the CORS headers itself for origins the app
    is configured to allow.
    """
    logger.exception("Unhandled exception on %s", request.url.path)

    headers: dict[str, str] = {}
    origin = request.headers.get("origin")
    if origin:
        from app.core.config import get_settings  # local import to avoid a module cycle

        if origin in get_settings().frontend_origins:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
            headers["Vary"] = "Origin"

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "detail": "An unexpected internal error occurred. Please contact support.",
        },
        headers=headers,
    )
