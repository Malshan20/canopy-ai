"""
Geospatial satellite verification service.

Verifies whether a farm's GPS coordinates show tree cover loss after the
EUDR compliance cut-off date (31 December 2020) using the production
Global Forest Watch Data API. This is one of the two Compliance Engine
checks (the other being mass balance validation in
`shipment_processor.py`).
"""

from __future__ import annotations

import re
import time
from typing import Any, Final

import httpx
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import Settings
from app.core.exceptions import GeospatialServiceError, InvalidCoordinateError, UpstreamRateLimitError
from app.core.logging import get_logger
from app.schemas.compliance import SatelliteVerificationResult
from app.services.audit_service import ACTOR_CANOPY_AI, AuditService

logger = get_logger(__name__)

_LATITUDE_RANGE: Final[tuple[float, float]] = (-90.0, 90.0)
_LONGITUDE_RANGE: Final[tuple[float, float]] = (-180.0, 180.0)

# Matches a specific, observed GFW-side internal error: their raster
# pixel-decoding logic throwing on a pixel value it doesn't recognize
# (e.g. "Value 0 not in pixel encoding defaultdict(...)"). This is a bug
# in Global Forest Watch's own backend, not this codebase — see the usage
# site in `_query_once` for the full explanation — and it's deterministic
# for a given query/geometry, so it should never be retried.
_NON_TRANSIENT_GFW_ERROR_PATTERN: Final[re.Pattern[str]] = re.compile(r"not in pixel encoding", re.IGNORECASE)


class _RetryableGfwError(Exception):
    """
    Internal marker for GFW failures that tenacity should retry: HTTP 500,
    502, 503, 504, or a network-level timeout/connection failure. Deliberately
    NOT used for 429 (rate limiting) or 4xx client errors — retrying those
    immediately would either make rate limiting worse or retry a request
    that will never succeed.
    """


class _TimeoutExhaustedError(Exception):
    """Internal marker: every retry attempt timed out or failed to connect."""


class GeospatialService:
    """
    Async client for the Global Forest Watch Data API, used to verify a
    single farm plot's deforestation status against the EUDR cut-off date.
    """

    # Used only if GFW_DATASET_VERSION is "latest" AND the runtime lookup
    # of the actual current version (see `_resolve_dataset_version`)
    # itself fails — better than an outright error, but should be bumped
    # occasionally since GFW republishes this dataset with a new version
    # roughly once a year as new observation years are added.
    _FALLBACK_DATASET_VERSION: Final[str] = "v1.11"

    def __init__(
        self, settings: Settings, http_client: httpx.AsyncClient, audit_service: AuditService
    ) -> None:
        self._settings = settings
        self._client = http_client
        self._audit_service = audit_service

    # Class-level (not instance-level) cache: `get_geospatial_service`
    # constructs a fresh `GeospatialService` per request, so caching on
    # `self` would still mean one extra "resolve latest" round-trip to
    # GFW on every single satellite check, forever. The resolved version
    # essentially never changes during a running deployment's lifetime
    # (GFW republishes it roughly annually), so sharing it process-wide
    # is safe and cuts that down to once per process, not once per call.
    # for why this needs to be class-level, not instance-level. Two entries
    # now: `umd_tree_cover_loss` (the primary dataset) and, since its own
    # entry started needing an alternate data source (see
    # `_query_integrated_alerts_once`), `gfw_integrated_alerts` too.
    _resolved_version_cache_by_dataset: dict[str, str] = {}

    async def _resolve_dataset_version(self, dataset: str, dataset_version_setting: str) -> str:
        """
        Resolve a dataset's configured version to a concrete version string.

        GFW's `/query/json` endpoint does NOT accept the literal string
        "latest" as a path segment for every dataset — every real, working
        example in GFW's own documentation for `umd_tree_cover_loss` pins a
        concrete version (e.g. `v1.9`). Passing "latest" there doesn't get
        rejected cleanly; the query engine fails to resolve it and returns
        a bare HTTP 500, indistinguishable from a genuine server error.
        Hardcoding a concrete version in config isn't a good fix either —
        GFW republishes datasets with a new version periodically, so a
        pinned version silently goes stale. Instead, when config says
        "latest", this asks GFW's own dataset metadata endpoint (`GET
        /dataset/{name}/latest`, which — unlike the query endpoint — DOES
        support the "latest" alias) what the actual current version is,
        and uses that resolved string for the real query — cached at the
        class level, per dataset, for the life of the process.
        """
        if dataset_version_setting != "latest":
            return dataset_version_setting
        cached = GeospatialService._resolved_version_cache_by_dataset.get(dataset)
        if cached is not None:
            return cached

        url = f"{self._settings.GFW_API_BASE_URL}/dataset/{dataset}/latest"
        try:
            response = await self._client.get(
                url,
                headers={"x-api-key": self._settings.GFW_API_KEY},
                timeout=self._settings.GFW_REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            version = response.json().get("data", {}).get("version")
            if not isinstance(version, str) or not version:
                raise ValueError(f"Metadata response had no usable 'version' field: {response.text[:200]}")
            logger.info("Resolved GFW dataset '%s' version alias 'latest' -> '%s'.", dataset, version)
            GeospatialService._resolved_version_cache_by_dataset[dataset] = version
            return version
        except Exception as exc:  # noqa: BLE001 — any failure here falls back, never blocks verification
            logger.warning(
                "Could not resolve GFW dataset '%s' version 'latest' (%s); falling back to pinned '%s'.",
                dataset,
                exc,
                self._FALLBACK_DATASET_VERSION,
            )
            GeospatialService._resolved_version_cache_by_dataset[dataset] = self._FALLBACK_DATASET_VERSION
            return self._FALLBACK_DATASET_VERSION

    async def _build_query_url(self, dataset: str | None = None, dataset_version_setting: str | None = None) -> str:
        dataset = dataset or self._settings.GFW_DATASET
        dataset_version_setting = dataset_version_setting or self._settings.GFW_DATASET_VERSION
        version = await self._resolve_dataset_version(dataset, dataset_version_setting)
        return f"{self._settings.GFW_API_BASE_URL}/dataset/{dataset}/{version}/query/json"

    async def verify_plot_compliance(
        self,
        latitude: float,
        longitude: float,
        shipment_id: str,
        organization_id: str,
        acting_user_id: str,
    ) -> SatelliteVerificationResult:
        """
        Check a single (latitude, longitude) pair against Global Forest
        Watch tree cover loss data and classify it per EUDR business rules.

        Never raises for ordinary "couldn't determine compliance" cases
        (API failure, malformed response, exhausted retries) — those are
        represented as a `verification_pending` / `api_timeout` / `unknown`
        result with a `reason`, since one farm's inconclusive check should
        never fail an entire shipment. It *does* raise `InvalidCoordinateError`
        for out-of-range input, since that's a caller bug, not an upstream
        failure.

        Every call records an audit event — `SATELLITE_CHECK_COMPLETED` when
        Global Forest Watch actually returned a determination (clean or
        forest-loss-detected), `SATELLITE_CHECK_FAILED` when it didn't
        (rate limited, timed out, or returned something we couldn't
        interpret) — via `_log_and_return`, the single exit point below.
        """
        self._validate_coordinate_range(latitude, longitude)

        logger.info(
            "Satellite verification started for coordinates (%.6f, %.6f).",
            latitude,
            longitude,
        )
        start_time = time.monotonic()

        try:
            payload, mode = await self._execute_with_retries(latitude, longitude)
        except UpstreamRateLimitError as exc:
            duration = time.monotonic() - start_time
            logger.warning(
                "Satellite verification rate-limited for (%.6f, %.6f) after %.2fs: %s",
                latitude,
                longitude,
                duration,
                exc.message,
            )
            result = SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="unknown",
                risk="unknown",
                reason="The satellite verification provider is rate-limiting requests. Try again shortly.",
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )
            return await self._log_and_return(shipment_id, organization_id, acting_user_id, result, duration)
        except _TimeoutExhaustedError as exc:
            duration = time.monotonic() - start_time
            logger.warning(
                "Satellite verification timed out for (%.6f, %.6f) after %.2fs: %s",
                latitude,
                longitude,
                duration,
                exc,
            )
            result = SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="api_timeout",
                risk="unknown",
                reason="The satellite verification provider did not respond in time, even after retries.",
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )
            return await self._log_and_return(shipment_id, organization_id, acting_user_id, result, duration)
        except GeospatialServiceError as exc:
            duration = time.monotonic() - start_time
            logger.error(
                "Satellite verification failed for (%.6f, %.6f) after %.2fs: %s",
                latitude,
                longitude,
                duration,
                exc.message,
            )
            result = SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="verification_pending",
                risk="unknown",
                reason=exc.message,
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )
            return await self._log_and_return(shipment_id, organization_id, acting_user_id, result, duration)

        duration = time.monotonic() - start_time
        if mode == "integrated_alerts":
            result = self._interpret_alerts_response(latitude, longitude, payload)
        elif mode == "count_only":
            result = self._interpret_count_only_response(latitude, longitude, payload)
        else:
            result = self._interpret_response(latitude, longitude, payload)
        logger.info(
            "Satellite verification complete for (%.6f, %.6f) in %.2fs: status=%s risk=%s.",
            latitude,
            longitude,
            duration,
            result.status,
            result.risk,
        )
        return await self._log_and_return(shipment_id, organization_id, acting_user_id, result, duration)

    async def _log_and_return(
        self,
        shipment_id: str,
        organization_id: str,
        acting_user_id: str,
        result: SatelliteVerificationResult,
        duration_seconds: float,
    ) -> SatelliteVerificationResult:
        """
        Single exit point for `verify_plot_compliance`: records the audit
        event for this check, then returns the result unchanged. A
        `status` of `verified_clean` or `forest_loss_detected` means GFW
        actually returned a determination (`SATELLITE_CHECK_COMPLETED`);
        anything else means the check didn't complete
        (`SATELLITE_CHECK_FAILED`).
        """
        completed = result.status in ("verified_clean", "forest_loss_detected")
        await self._audit_service.log_event(
            shipment_id=shipment_id,
            organization_id=organization_id,
            acting_user_id=acting_user_id,
            actor=ACTOR_CANOPY_AI,
            action_type="SATELLITE_CHECK_COMPLETED" if completed else "SATELLITE_CHECK_FAILED",
            details={
                "latitude": result.latitude,
                "longitude": result.longitude,
                "status": result.status,
                "risk": result.risk,
                "forest_loss_detected": result.status == "forest_loss_detected",
                "tree_cover_loss_years": result.tree_cover_loss_years,
                "reason": result.reason,
                "cutoff_year": result.cutoff_year,
                "duration_seconds": round(duration_seconds, 3),
            },
        )
        return result

    async def _execute_with_retries(self, latitude: float, longitude: float) -> tuple[dict[str, Any], str]:
        """
        Run the standard grouped (per-year) query first. If it terminates
        in GFW's own non-transient pixel-decoding bug specifically (see
        `_NON_TRANSIENT_GFW_ERROR_PATTERN`), work through three
        progressively different fallbacks before giving up, each
        addressing a different theory of what triggers it:

          1. Standard: grouped by year, with the tree-cover-density filter.
          2. Drop the density filter, keep the GROUP BY — in case the
             filter itself is what the bug trips over.
          3. Drop the GROUP BY entirely and use a bare COUNT(*) — in case
             it's the *aggregation shape* that trips over an empty result
             set.
          4. Abandon `umd_tree_cover_loss` entirely and query
             `gfw_integrated_alerts` instead — a genuinely different
             dataset with a different field encoding (see
             `_query_integrated_alerts_once`'s docstring). Reached only
             when 1–3 *all* fail identically: real, observed evidence
             (a Brazilian town, mid-Atlantic ocean, and a protected forest
             reserve all failing at the exact same internal GFW function,
             regardless of query shape) points at this being a systemic
             bug in how their backend handles this one field at all, not
             something any SQL variation against it can route around.

        Returns `(payload, mode)` where `mode` is one of `"grouped"`,
        `"count_only"`, or `"integrated_alerts"` — the caller needs to
        know which query shape actually produced the payload, since each
        has a different response shape and needs different interpretation
        (`_interpret_response`, `_interpret_count_only_response`, or
        `_interpret_alerts_response` respectively).
        """
        try:
            payload = await self._execute_with_retries_for_shape(latitude, longitude, use_density_filter=True)
            return payload, "grouped"
        except GeospatialServiceError as exc:
            if not _NON_TRANSIENT_GFW_ERROR_PATTERN.search(str(exc)):
                raise
            logger.warning(
                "GFW's own raster pixel-decoding failed for (%.6f, %.6f) with the standard query; "
                "retrying once with a simplified query shape (no tree-cover-density filter) in case "
                "that avoids it: %s",
                latitude,
                longitude,
                exc,
            )

        try:
            payload = await self._execute_with_retries_for_shape(latitude, longitude, use_density_filter=False)
            logger.info(
                "Simplified query shape succeeded for (%.6f, %.6f) after the standard query hit GFW's "
                "pixel-decoding bug.",
                latitude,
                longitude,
            )
            return payload, "grouped"
        except GeospatialServiceError as exc:
            if not _NON_TRANSIENT_GFW_ERROR_PATTERN.search(str(exc)):
                raise
            logger.warning(
                "Simplified query shape ALSO hit GFW's pixel-decoding bug for (%.6f, %.6f) — the "
                "GROUP BY aggregation itself looks like the trigger, not the WHERE filter. Trying a "
                "COUNT-only query (no GROUP BY) next: %s",
                latitude,
                longitude,
                exc,
            )

        try:
            payload = await self._execute_with_retries_for_shape(
                latitude, longitude, use_density_filter=True, count_only=True
            )
            logger.info(
                "COUNT-only query succeeded for (%.6f, %.6f) after both grouped shapes hit GFW's "
                "pixel-decoding bug.",
                latitude,
                longitude,
            )
            return payload, "count_only"
        except GeospatialServiceError as exc:
            if not _NON_TRANSIENT_GFW_ERROR_PATTERN.search(str(exc)):
                raise
            logger.warning(
                "COUNT-only query ALSO hit GFW's pixel-decoding bug for (%.6f, %.6f) — every query "
                "shape against umd_tree_cover_loss__year fails identically, regardless of aggregation. "
                "Falling back to the gfw_integrated_alerts dataset entirely: %s",
                latitude,
                longitude,
                exc,
            )

        payload = await self._query_integrated_alerts_once(latitude, longitude)
        logger.info(
            "gfw_integrated_alerts fallback succeeded for (%.6f, %.6f) after all three query shapes "
            "against umd_tree_cover_loss__year failed.",
            latitude,
            longitude,
        )
        return payload, "integrated_alerts"

    async def _execute_with_retries_for_shape(
        self, latitude: float, longitude: float, use_density_filter: bool, count_only: bool = False
    ) -> dict[str, Any]:
        """
        Perform one GFW query (in the given shape) with exponential-backoff
        retries, limited to the failure modes explicitly called out as
        retryable (5xx and network/timeout errors). Every retry attempt and
        every terminal failure is logged.
        """
        attempt_counter = {"count": 0}

        async def _log_before_sleep(retry_state: Any) -> None:
            attempt_counter["count"] += 1
            logger.warning(
                "Retrying GFW query for (%.6f, %.6f) — attempt %d, last error: %s",
                latitude,
                longitude,
                attempt_counter["count"],
                retry_state.outcome.exception() if retry_state.outcome else "unknown",
            )

        retrying = AsyncRetrying(
            stop=stop_after_attempt(self._settings.GFW_MAX_RETRIES + 1),
            wait=wait_exponential(multiplier=1, min=1, max=10),
            retry=retry_if_exception_type((_RetryableGfwError, httpx.TimeoutException, httpx.ConnectError)),
            before_sleep=_log_before_sleep,
            reraise=True,
        )

        try:
            async for attempt in retrying:
                with attempt:
                    return await self._query_once(
                        latitude, longitude, use_density_filter=use_density_filter, count_only=count_only
                    )
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            raise _TimeoutExhaustedError(str(exc)) from exc
        except _RetryableGfwError as exc:
            raise GeospatialServiceError(f"Global Forest Watch API error: {exc}") from exc
        except RetryError as exc:  # pragma: no cover - defensive; reraise=True makes this unlikely
            raise GeospatialServiceError(f"Global Forest Watch API retries exhausted: {exc}") from exc

        # Unreachable in practice (AsyncRetrying always raises or returns
        # inside the loop), but keeps type checkers happy.
        raise GeospatialServiceError("Global Forest Watch query did not complete.")

    # Half-side of the square analysis buffer drawn around a plot's point
    # coordinate, in degrees. ~0.00063° ≈ 70 m at the equator, giving a
    # ~140 m square — small enough to stay within a smallholder plot,
    # large enough to tolerate handheld-GPS imprecision in the source
    # documents. Exists because GFW's raster analysis endpoint rejects
    # Point geometries outright ("Geostore must be a Polygon or
    # MultiPolygon for raster analysis" — HTTP 400), so a point must be
    # buffered into a polygon before querying.
    _POINT_BUFFER_DEGREES: Final[float] = 0.00063

    async def _query_once(
        self, latitude: float, longitude: float, use_density_filter: bool = True, count_only: bool = False
    ) -> dict[str, Any]:
        """
        Issue a single query to the Global Forest Watch Data API for tree
        cover loss around the given point. Raises `_RetryableGfwError` for 5xx
        responses (so the retry layer can catch them), `UpstreamRateLimitError`
        for 429 (not retried), and `GeospatialServiceError` for any other
        non-2xx or malformed response.

        `use_density_filter=False` drops the `umd_tree_cover_density_2000__
        threshold >= 30` condition — see `_execute_with_retries`'s one-shot
        fallback, which tries this simpler query shape when the standard one
        hits GFW's own internal pixel-decoding bug, on the chance that
        whichever aggregation path their query engine takes for the
        filtered query is what triggers it.

        `count_only=True` replaces the `GROUP BY`/per-year breakdown with a
        bare `COUNT(*)` — see `_execute_with_retries`'s second-tier
        fallback. GFW's own documented raster-analysis behavior explicitly
        describes `COUNT` returning 0 cleanly for a geometry with no
        matching pixels ("This will return... {"count": 242}"), unlike a
        `GROUP BY` over zero rows, which is the more likely trigger for
        the pixel-decoding bug than the WHERE clause itself — the
        `use_density_filter=False` fallback removes a filter but keeps the
        `GROUP BY`, and it still failed for a genuinely empty (ocean)
        location, pointing at the aggregation shape itself, not the filter.
        """
        d = self._POINT_BUFFER_DEGREES
        density_clause = " AND umd_tree_cover_density_2000__threshold >= 30" if use_density_filter else ""

        if count_only:
            sql = f"SELECT COUNT(*) AS loss_pixel_count FROM results WHERE umd_tree_cover_loss__year > 0{density_clause}"
        else:
            sql = (
                "SELECT umd_tree_cover_loss__year, SUM(area__ha) AS area__ha FROM results "
                f"WHERE umd_tree_cover_loss__year > 0{density_clause} "
                "GROUP BY umd_tree_cover_loss__year ORDER BY umd_tree_cover_loss__year"
            )

        payload = {
            # GFW's Data API exposes the queryable virtual table as
            # `results` for every dataset, regardless of the dataset's own
            # name — this isn't a placeholder, it's the actual required
            # table name (confirmed against GFW's own documented example:
            # "SELECT SUM(area__ha) FROM results WHERE
            # umd_tree_cover_loss__year = 2019"). Querying `FROM data`
            # instead doesn't get validated away with a clean 4xx; GFW's
            # query engine chokes on the unresolvable table and returns a
            # bare HTTP 500.
            #
            # The standard query is deliberately aggregated (SUM(area__ha)
            # … GROUP BY), matching that same documented example, rather
            # than a bare `SELECT umd_tree_cover_loss__year` with no
            # aggregate function. `umd_tree_cover_density_2000__threshold
            # >= 30` is GFW's own standard analysis default (documented
            # across their tree-cover-loss methodology) — it scopes the
            # result to pixels that were actually forest in 2000.
            "sql": sql,
            # GFW's raster analysis requires a Polygon/MultiPolygon — a bare
            # Point is rejected with HTTP 400. Buffer the plot coordinate
            # into a small closed square (counter-clockwise ring, first
            # point repeated last, per GeoJSON spec).
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [longitude - d, latitude - d],
                        [longitude + d, latitude - d],
                        [longitude + d, latitude + d],
                        [longitude - d, latitude + d],
                        [longitude - d, latitude - d],
                    ]
                ],
            },
        }
        headers = {
            "x-api-key": self._settings.GFW_API_KEY,
            "Content-Type": "application/json",
        }
        query_url = await self._build_query_url()

        try:
            response = await self._client.post(
                query_url,
                json=payload,
                headers=headers,
                timeout=self._settings.GFW_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.TimeoutException:
            raise
        except httpx.ConnectError:
            raise
        except httpx.RequestError as exc:
            raise GeospatialServiceError(f"Network error calling Global Forest Watch: {exc}") from exc

        if response.status_code in (500, 502, 503, 504):
            # Capturing `detail` here (previously only done for the
            # non-retryable branch below) matters: it's the only way to
            # see WHAT Global Forest Watch actually said was wrong. A
            # bare "HTTP 500 from Global Forest Watch" with the body
            # discarded is exactly why earlier query-shape bugs (Point
            # vs Polygon, wrong table name) took multiple round-trips to
            # pin down — the fix each time came from GFW's own error
            # detail, and 5xx responses were the one place that detail
            # was being silently thrown away.
            detail = self._safe_error_detail(response)

            if _NON_TRANSIENT_GFW_ERROR_PATTERN.search(detail):
                # A real, observed failure mode: GFW's OWN raster
                # pixel-decoding logic throws internally for certain
                # pixels (e.g. a background/no-data value of 0 not
                # present in whatever internal year-encoding map their
                # backend uses) and returns it as a bare HTTP 500. This
                # is not a bug in this codebase — there is no pixel
                # decoder here at all; the query goes through GFW's own
                # SQL Query API (`/query/json`), which returns already-
                # decoded `{"umd_tree_cover_loss__year": ...}` rows (see
                # `_interpret_response`), not raw pixel values. GFW's
                # error text just happens to reveal an implementation
                # detail of their own backend's internals.
                #
                # Critically, it's also deterministic for a given
                # geometry — the exact same query against the exact same
                # location will fail the exact same way every time, so
                # retrying it (the default behavior for any 5xx) only
                # burns ~10 seconds of exponential backoff for no
                # benefit. Raising `GeospatialServiceError` directly here
                # (instead of `_RetryableGfwError`) skips the retry loop
                # entirely and goes straight to `verify_plot_compliance`'s
                # existing terminal-error handling, which already does
                # the right thing: a `verification_pending` result, never
                # a raised exception that would fail the whole shipment.
                #
                # Deliberately NOT reinterpreted as "no loss detected"
                # here, even though pixel value 0 often does mean exactly
                # that. For an EUDR compliance tool, silently upgrading
                # "our upstream data provider's server errored and we
                # don't actually know what it would have said" into a
                # confident "verified clean" is the wrong tradeoff — an
                # honest "couldn't be determined, try again or check
                # manually" is worth more than a guess dressed up as a
                # result, however plausible that guess is.
                raise GeospatialServiceError(
                    "Global Forest Watch returned an internal server error while decoding its own "
                    f"raster data for this location (not an issue in this application): {detail}"
                )

            raise _RetryableGfwError(f"HTTP {response.status_code} from Global Forest Watch: {detail}")

        if response.status_code == 429:
            raise UpstreamRateLimitError("Global Forest Watch API rate limit reached.")

        if response.status_code != 200:
            detail = self._safe_error_detail(response)
            raise GeospatialServiceError(
                f"Global Forest Watch returned HTTP {response.status_code}: {detail}"
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise GeospatialServiceError(
                f"Global Forest Watch returned a response that could not be parsed as JSON: {exc}"
            ) from exc

        if not isinstance(data, dict):
            raise GeospatialServiceError(
                f"Global Forest Watch returned an unexpected response structure: {type(data).__name__}"
            )

        return data

    async def _query_integrated_alerts_once(self, latitude: float, longitude: float) -> dict[str, Any]:
        """
        Query GFW's `gfw_integrated_alerts` dataset — a fundamentally
        different data source from `umd_tree_cover_loss`, used as a last
        resort when all three query shapes against the primary dataset
        hit its pixel-decoding bug (see `_execute_with_retries`'s fourth
        tier).

        This isn't a workaround grabbed at random: `gfw_integrated_alerts`
        combines multiple independent near-real-time alert systems
        (GLAD-L, GLAD-S2, RADD) covering roughly 2021 onward, and GFW's
        own published EUDR guidance explicitly recommends it as a
        complement to the annual tree-cover-loss dataset for exactly this
        purpose. Two things make it a good fit for this specific fallback,
        not just "a different dataset that might work":

          1. Its fields (`gfw_integrated_alerts__date`, a date string, and
             `__confidence`, a string) are structurally nothing like
             `umd_tree_cover_loss__year`'s integer pixel-to-year lookup
             table — the exact mechanism that's broken. A bug in decoding
             one doesn't imply anything about the other.
          2. Its coverage window (~2021–present) lines up almost exactly
             with the EUDR cutoff (31 Dec 2020) — the only period this
             tool actually needs to ask "was there loss?" about. It can't
             answer questions about loss *before* 2021 (a genuinely clean
             pre-2021 baseline needs the primary dataset), but for the
             cutoff-relevant window, it's arguably the more directly
             suited dataset, not just a substitute.

        Raises `GeospatialServiceError` on any non-2xx or malformed
        response — deliberately NOT wrapped in the same non-transient
        pattern detection or retried, since this is already the last
        tier; if this fails too, `verify_plot_compliance` reports an
        honest `verification_pending`.
        """
        d = self._POINT_BUFFER_DEGREES
        cutoff_date = f"{self._settings.EUDR_CUTOFF_YEAR}-12-31"
        payload = {
            "sql": (
                "SELECT gfw_integrated_alerts__date, gfw_integrated_alerts__confidence FROM results "
                f"WHERE gfw_integrated_alerts__date > '{cutoff_date}'"
            ),
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [longitude - d, latitude - d],
                        [longitude + d, latitude - d],
                        [longitude + d, latitude + d],
                        [longitude - d, latitude + d],
                        [longitude - d, latitude - d],
                    ]
                ],
            },
        }
        headers = {
            "x-api-key": self._settings.GFW_API_KEY,
            "Content-Type": "application/json",
        }
        query_url = await self._build_query_url(dataset="gfw_integrated_alerts", dataset_version_setting="latest")

        try:
            response = await self._client.post(
                query_url,
                json=payload,
                headers=headers,
                timeout=self._settings.GFW_REQUEST_TIMEOUT_SECONDS,
            )
        except httpx.RequestError as exc:
            raise GeospatialServiceError(f"Network error calling Global Forest Watch (integrated alerts): {exc}") from exc

        if response.status_code != 200:
            detail = self._safe_error_detail(response)
            raise GeospatialServiceError(
                f"Global Forest Watch integrated-alerts fallback returned HTTP {response.status_code}: {detail}"
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise GeospatialServiceError(
                f"Global Forest Watch integrated-alerts fallback returned unparseable JSON: {exc}"
            ) from exc

        if not isinstance(data, dict):
            raise GeospatialServiceError(
                f"Global Forest Watch integrated-alerts fallback returned an unexpected response structure: "
                f"{type(data).__name__}"
            )

        return data

    def _interpret_alerts_response(
        self, latitude: float, longitude: float, payload: dict[str, Any]
    ) -> SatelliteVerificationResult:
        """
        Interpret the fourth-tier `gfw_integrated_alerts` fallback's
        response. Confidence-aware, per GFW's own guidance that
        lower-confidence alerts (a single detection system, not yet
        corroborated) warrant a human look rather than an automatic
        determination:

          - Any "high" or "highest" confidence alert → `forest_loss_detected`.
            Multiple independent systems agreeing is GFW's own bar for a
            confident finding.
          - Only "low"/"nominal" confidence alerts, none corroborated →
            `verification_pending`. A single-system detection is real
            signal, but not confident enough to assert non-compliance on
            its own.
          - No alerts at all → `verified_clean`, with an honest caveat:
            this only rules out post-cutoff loss captured by near-real-time
            alerts, which is exactly the cutoff-relevant question, but it
            is not the same statement as a full historical baseline check.
        """
        rows = payload.get("data")
        if rows is None or not isinstance(rows, list):
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="unknown",
                risk="unknown",
                reason="Global Forest Watch's integrated-alerts fallback returned a response without the expected 'data' field.",
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )

        alert_dates: list[str] = []
        has_high_confidence = False
        for row in rows:
            if not isinstance(row, dict):
                continue
            date_value = row.get("gfw_integrated_alerts__date")
            confidence = str(row.get("gfw_integrated_alerts__confidence", "")).lower()
            if isinstance(date_value, str) and date_value:
                alert_dates.append(date_value)
            if confidence in ("high", "highest"):
                has_high_confidence = True

        if not alert_dates:
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="verified_clean",
                risk="low",
                tree_cover_loss_years=[],
                reason=(
                    f"No near-real-time disturbance alerts detected since the {self._settings.EUDR_CUTOFF_YEAR} "
                    "cutoff. (Global Forest Watch's primary annual tree-cover-loss dataset is currently "
                    "unavailable for this location due to an upstream issue on their side; this result "
                    "comes from their integrated deforestation alerts system instead, which independently "
                    "covers the post-cutoff period this check cares about.)"
                ),
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )

        first_year = min(int(d[:4]) for d in alert_dates if len(d) >= 4 and d[:4].isdigit())
        status = "forest_loss_detected" if has_high_confidence else "verification_pending"
        risk = "critical" if has_high_confidence else "unknown"
        confidence_note = (
            "corroborated by multiple independent detection systems"
            if has_high_confidence
            else "detected by a single system, not yet corroborated — treat as a lead, not a confirmed finding"
        )
        return SatelliteVerificationResult(
            latitude=latitude,
            longitude=longitude,
            status=status,
            risk=risk,
            tree_cover_loss_years=[first_year] if has_high_confidence else [],
            reason=(
                f"Global Forest Watch's integrated deforestation alerts detected {len(alert_dates)} post-cutoff "
                f"disturbance alert(s) at this location since {first_year}, {confidence_note}. (Their primary "
                "annual tree-cover-loss dataset is currently unavailable for this location due to an upstream "
                "issue on their side — this result comes from the alerts system instead.)"
            ),
            cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
        )

    def _interpret_response(
        self, latitude: float, longitude: float, payload: dict[str, Any]
    ) -> SatelliteVerificationResult:
        """
        Apply EUDR business rules to a successful GFW response: any tree
        cover loss year strictly after the cutoff is a critical finding;
        otherwise the plot is clean.
        """
        rows = payload.get("data")
        if rows is None or not isinstance(rows, list):
            logger.warning(
                "Unexpected GFW response structure for (%.6f, %.6f): missing or invalid 'data' field.",
                latitude,
                longitude,
            )
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="unknown",
                risk="unknown",
                reason="Global Forest Watch returned a response without the expected 'data' field.",
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )

        loss_years: list[int] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            year = row.get("umd_tree_cover_loss__year")
            if isinstance(year, (int, float)) and year > 0:
                loss_years.append(int(year))

        loss_years_after_cutoff = sorted(
            {year for year in loss_years if year > self._settings.EUDR_CUTOFF_YEAR}
        )

        if loss_years_after_cutoff:
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="forest_loss_detected",
                risk="critical",
                tree_cover_loss_years=loss_years_after_cutoff,
                reason=(
                    f"Tree cover loss detected in {', '.join(map(str, loss_years_after_cutoff))} "
                    f"— after the EUDR cut-off of {self._settings.EUDR_CUTOFF_YEAR}."
                ),
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )

        return SatelliteVerificationResult(
            latitude=latitude,
            longitude=longitude,
            status="verified_clean",
            risk="low",
            tree_cover_loss_years=sorted(set(loss_years)),
            reason=f"No tree cover loss detected after {self._settings.EUDR_CUTOFF_YEAR}.",
            cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
        )

    def _interpret_count_only_response(
        self, latitude: float, longitude: float, payload: dict[str, Any]
    ) -> SatelliteVerificationResult:
        """
        Interpret the third-tier COUNT-only fallback's response (see
        `_execute_with_retries`). This can only answer "does any
        tree-cover-loss pixel exist in this area at all", not which
        year(s) — so its business-rule mapping is deliberately more
        conservative than `_interpret_response`'s:

          - count == 0 → genuinely `verified_clean`. A count of zero is
            unambiguous regardless of which years would have been
            involved — there's nothing to be non-compliant about.
          - count > 0 → `verification_pending`, NOT `forest_loss_detected`.
            EUDR only cares about loss *after* the cutoff year; pre-cutoff
            loss is exempt. Without year data, loss pixels existing
            somewhere in this area's multi-decade history doesn't tell us
            whether any of it happened after the cutoff. Claiming
            "critical" from a bare count would overstate what's actually
            known — the honest result is "needs a human to check",
            exactly like any other inconclusive case.
        """
        rows = payload.get("data")
        if not rows or not isinstance(rows, list) or not isinstance(rows[0], dict):
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="unknown",
                risk="unknown",
                reason="Global Forest Watch's count-only fallback returned a response without the expected data.",
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )

        count = rows[0].get("loss_pixel_count")
        if not isinstance(count, (int, float)):
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="unknown",
                risk="unknown",
                reason="Global Forest Watch's count-only fallback returned an unrecognized count value.",
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )
        count = int(count)

        if count == 0:
            return SatelliteVerificationResult(
                latitude=latitude,
                longitude=longitude,
                status="verified_clean",
                risk="low",
                tree_cover_loss_years=[],
                reason=(
                    "No tree cover loss pixels detected in this area. (Global Forest Watch's per-year "
                    "breakdown is currently unavailable for this location due to an upstream issue on "
                    "their side, but a pixel count of zero is unambiguous — there is nothing to report "
                    "regardless of year.)"
                ),
                cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
            )

        return SatelliteVerificationResult(
            latitude=latitude,
            longitude=longitude,
            status="verification_pending",
            risk="unknown",
            tree_cover_loss_years=[],
            reason=(
                f"Global Forest Watch detected {count} tree-cover-loss pixel(s) somewhere in this area, "
                f"but the specific year(s) could not be determined due to an upstream issue on their "
                f"side. This does not confirm non-compliance — the loss may predate the "
                f"{self._settings.EUDR_CUTOFF_YEAR} cutoff — but it does mean this plot needs a manual "
                f"check rather than an automated clean/critical determination."
            ),
            cutoff_year=self._settings.EUDR_CUTOFF_YEAR,
        )

    @staticmethod
    def _safe_error_detail(response: httpx.Response) -> str:
        try:
            body = response.json()
            return str(body.get("message", body))[:300]
        except ValueError:
            return response.text[:300]

    @staticmethod
    def _validate_coordinate_range(latitude: float, longitude: float) -> None:
        if not (_LATITUDE_RANGE[0] <= latitude <= _LATITUDE_RANGE[1]):
            raise InvalidCoordinateError(
                f"Latitude {latitude} is outside the valid range {_LATITUDE_RANGE}."
            )
        if not (_LONGITUDE_RANGE[0] <= longitude <= _LONGITUDE_RANGE[1]):
            raise InvalidCoordinateError(
                f"Longitude {longitude} is outside the valid range {_LONGITUDE_RANGE}."
            )
