"""
Gemini-powered vision extraction service.

Sends weighbridge receipts and land deeds (as images, rendering the first
page of PDFs where necessary) to Google Gemini and parses a strictly
structured JSON response into the `ExtractedData` schema.
"""

from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from typing import Final

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.core.exceptions import (
    ExtractionServiceError,
    UpstreamRateLimitError,
    UpstreamTimeoutError,
)
from app.core.logging import get_logger
from app.schemas.documents import ExtractedData

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Exact system prompt sent to Gemini for every vision extraction request.
# ---------------------------------------------------------------------------
GEMINI_SYSTEM_PROMPT: Final[str] = """You are a document data extraction engine for an EU Deforestation Regulation (EUDR) compliance platform. You extract structured data from supply-chain documents: weighbridge receipts, land deeds, and due diligence statements (EUDR deforestation-free / legal-compliance evidence reports, such as those issued by Rainforest Alliance or similar certification schemes).

Rules you MUST follow at all times:
1. Never hallucinate. Only report values that are actually visible and legible in the provided image(s). You may be given more than one image — these are consecutive pages of the same document; use all of them together.
2. Preserve original values exactly as written (numbers, names, dates, coordinates). Do not normalize, translate, or "correct" values unless explicitly asked to normalize a date format.
3. Output valid JSON only. Do not include Markdown formatting, code fences, comments, or any text outside the JSON object.
4. If a field's value is not visible, not present, or you are not confident, set it to null. Do not guess.
5. If handwriting is present and illegible, set the affected field(s) to null and set ai_confidence_score below 0.5.
6. Format date_of_transaction and statement_date strictly as YYYY-MM-DD when a date is legible; otherwise null.
7. Estimate ai_confidence_score honestly between 0.0 and 1.0, reflecting overall extraction confidence for this document.
8. For "country": extract the country of production/origin as written. If what's written is not an actual country — an ocean, a transit zone, a region name, or anything else that isn't a real, recognized nation — set this field to null rather than transcribing it verbatim. This is a narrow, deliberate exception to rule 2 (verbatim preservation): a real EUDR due diligence statement cannot list a non-country as its country of production, so passing through something like "International waters" as if it were a real answer is not more faithful to the source, it's a wrong answer with high confidence attached.
9. For a weighbridge receipt or land deed, populate: farmer_name, crop_weight_kg, date_of_transaction, gps_coordinates, supplier_name, village, commodity, receipt_number, country, language_detected, document_notes.
10. For a due diligence statement (an EUDR/deforestation-free evidence report — look for an "Operator" name, an HS Code, a "Due Diligence Statement" title, references to Regulation (EU) 2023/1115, or a legal-compliance conformity table), instead populate: operator_name, hs_code, product_name, quantity_kg, reference_number, statement_date, deforestation_free_declared (true only if Section A / the deforestation-free evidence explicitly supports that conclusion), legal_compliance_conformity (true only if every row of the compliance table reads "Conformity"), geolocation_evidence_present (true if a plot/geolocation map is shown, even though you cannot read exact coordinates off a map image). ALSO copy the declared quantity into crop_weight_kg and the product name into commodity, so this document contributes correctly to shipment-wide weight and commodity totals alongside receipts. Set supplier_name to the operator_name as well, so it appears consistently in supplier-facing views. Leave farmer_name, receipt_number, village, and gps_coordinates null for this document type unless a literal machine-readable coordinate is printed as text (a map image alone does not count).
11. Return exactly these fields, nothing more, nothing less:
    farmer_name, crop_weight_kg, date_of_transaction, gps_coordinates, ai_confidence_score,
    supplier_name, village, commodity, receipt_number, country, language_detected, document_notes,
    operator_name, hs_code, product_name, quantity_kg, reference_number, statement_date,
    deforestation_free_declared, legal_compliance_conformity, geolocation_evidence_present

Return ONLY the JSON object."""

_EXTRACTION_RESPONSE_SCHEMA: Final[dict] = {
    "type": "OBJECT",
    "properties": {
        "farmer_name": {"type": "STRING", "nullable": True},
        "crop_weight_kg": {"type": "NUMBER", "nullable": True},
        "date_of_transaction": {"type": "STRING", "nullable": True},
        "gps_coordinates": {"type": "STRING", "nullable": True},
        "ai_confidence_score": {"type": "NUMBER"},
        "supplier_name": {"type": "STRING", "nullable": True},
        "village": {"type": "STRING", "nullable": True},
        "commodity": {"type": "STRING", "nullable": True},
        "receipt_number": {"type": "STRING", "nullable": True},
        "country": {"type": "STRING", "nullable": True},
        "language_detected": {"type": "STRING", "nullable": True},
        "document_notes": {"type": "STRING", "nullable": True},
        "operator_name": {"type": "STRING", "nullable": True},
        "hs_code": {"type": "STRING", "nullable": True},
        "product_name": {"type": "STRING", "nullable": True},
        "quantity_kg": {"type": "NUMBER", "nullable": True},
        "reference_number": {"type": "STRING", "nullable": True},
        "statement_date": {"type": "STRING", "nullable": True},
        "deforestation_free_declared": {"type": "BOOLEAN", "nullable": True},
        "legal_compliance_conformity": {"type": "BOOLEAN", "nullable": True},
        "geolocation_evidence_present": {"type": "BOOLEAN", "nullable": True},
    },
    "required": ["ai_confidence_score"],
}

_IMAGE_MIME_MAP: Final[dict[str, str]] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

# How many leading pages of a multi-page PDF to render for vision
# extraction. A weighbridge receipt or land deed is essentially always
# one page, but a due diligence statement's key evidence — the
# geolocation/plot map and the legal-compliance conformity table — is
# routinely on page 2, so extraction on page 1 alone silently misses it.
_MAX_PDF_PAGES_TO_RENDER: Final[int] = 2

# Some real-world PDFs (e.g. reports exported from a web page) are a
# single PDF "page" with an enormous height rather than several normal
# pages — one observed EUDR due diligence statement was one page at
# 600x3411pt, which renders to a ~1667x9475px image. A vision model
# reliably fails to read content that far down an extreme-aspect-ratio
# image. Any rendered page taller than this (in PDF points; 792pt ==
# US Letter height) is sliced into vertically overlapping tiles, each
# sent as its own image, so no section of an oversized page is silently
# dropped just because it wasn't a "real" page break.
_TILE_HEIGHT_PT: Final[float] = 792.0
_TILE_OVERLAP_PT: Final[float] = 40.0
_TILE_HEIGHT_TOLERANCE: Final[float] = 1.15  # allow slightly-over-Letter pages to stay untiled
# Hard cap on total images sent per document (across all rendered pages
# and their tiles) to bound Gemini request cost/latency on pathological inputs.
_MAX_TILES_TOTAL: Final[int] = 8


class GeminiExtractor:
    """Thin async wrapper around the Gemini `generateContent` vision endpoint."""

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = http_client

    async def extract(self, filename: str, extension: str, absolute_path: Path) -> ExtractedData:
        """Run vision extraction on a single document and return validated structured data."""
        pages = await asyncio.to_thread(self._prepare_image_pages, extension, absolute_path)

        image_parts = [
            {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(page_bytes).decode("ascii")}}
            for page_bytes, mime_type in pages
        ]

        payload = {
            "system_instruction": {"parts": [{"text": GEMINI_SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                f"Extract structured data from this document "
                                f"(source filename: {filename}). "
                                f"{len(image_parts)} image(s) are attached, in top-to-bottom reading "
                                "order (either separate pages, or vertical sections of one long page "
                                "with a small overlap between consecutive sections). "
                                "Return JSON only."
                            )
                        },
                        *image_parts,
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json",
                "responseSchema": _EXTRACTION_RESPONSE_SCHEMA,
            },
        }

        raw_text = await self._request_with_retries(payload, filename)
        return self._parse_response(raw_text, filename)

    async def _request_with_retries(self, payload: dict, filename: str) -> str:
        url = (
            f"{self._settings.GEMINI_API_BASE_URL}/models/"
            f"{self._settings.GEMINI_MODEL}:generateContent"
        )
        params = {"key": self._settings.GEMINI_API_KEY}
        last_error: Exception | None = None

        for attempt in range(1, self._settings.GEMINI_MAX_RETRIES + 2):
            try:
                response = await self._client.post(
                    url,
                    params=params,
                    json=payload,
                    timeout=self._settings.GEMINI_REQUEST_TIMEOUT_SECONDS,
                )

                if response.status_code == 429:
                    raise UpstreamRateLimitError(
                        f"Gemini rate limit reached while extracting '{filename}'."
                    )
                response.raise_for_status()

                data = response.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    raise ExtractionServiceError(f"Gemini returned no candidates for '{filename}'.")

                parts = candidates[0]["content"]["parts"]
                return "".join(part.get("text", "") for part in parts).strip()

            except httpx.TimeoutException:
                last_error = UpstreamTimeoutError(
                    f"Gemini request timed out while extracting '{filename}'."
                )
                logger.warning("Gemini timeout on attempt %d for '%s'.", attempt, filename)
            except UpstreamRateLimitError as exc:
                last_error = exc
                logger.warning("Gemini rate-limited on attempt %d for '%s'.", attempt, filename)
            except (httpx.HTTPStatusError, httpx.RequestError, KeyError, IndexError) as exc:
                last_error = ExtractionServiceError(
                    f"Gemini extraction failed for '{filename}': {exc}"
                )
                logger.warning("Gemini error on attempt %d for '%s': %s", attempt, filename, exc)

            await asyncio.sleep(min(2**attempt * 0.5, 5.0))

        assert last_error is not None
        raise last_error

    @staticmethod
    def _parse_response(raw_text: str, filename: str) -> ExtractedData:
        """Parse and validate Gemini's JSON output, guarding against malformed responses."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].strip()

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise ExtractionServiceError(
                f"Gemini returned malformed JSON for '{filename}': {exc}"
            ) from exc

        try:
            return ExtractedData.model_validate(parsed)
        except ValidationError as exc:
            raise ExtractionServiceError(
                f"Gemini JSON failed schema validation for '{filename}': {exc}"
            ) from exc

    @staticmethod
    def _prepare_image_pages(extension: str, absolute_path: Path) -> list[tuple[bytes, str]]:
        """Return [(image_bytes, mime_type), ...] for every page to send to
        Gemini, rendering PDFs to PNG page images first (up to
        `_MAX_PDF_PAGES_TO_RENDER` pages — see that constant's docstring
        for why more than one page matters for some document types)."""
        if extension == ".pdf":
            return GeminiExtractor._render_pdf_pages(absolute_path)

        return [
            (
                absolute_path.read_bytes(),
                _IMAGE_MIME_MAP.get(extension, "application/octet-stream"),
            )
        ]

    @staticmethod
    def _render_pdf_pages(pdf_path: Path) -> list[tuple[bytes, str]]:
        """Render up to the first `_MAX_PDF_PAGES_TO_RENDER` pages of a PDF
        to PNG images using PyMuPDF, slicing any unusually tall page into
        overlapping vertical tiles (see `_TILE_HEIGHT_PT`'s docstring)."""
        try:
            import fitz  # PyMuPDF

            with fitz.open(str(pdf_path)) as doc:
                if doc.page_count == 0:
                    raise ExtractionServiceError(f"PDF '{pdf_path.name}' has no pages.")

                page_count = min(doc.page_count, _MAX_PDF_PAGES_TO_RENDER)
                images: list[tuple[bytes, str]] = []
                for page_index in range(page_count):
                    page = doc.load_page(page_index)
                    images.extend(GeminiExtractor._render_page_as_tiles(page))
                    if len(images) >= _MAX_TILES_TOTAL:
                        break
                return images[:_MAX_TILES_TOTAL]
        except ExtractionServiceError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise ExtractionServiceError(
                f"Failed to render PDF page(s) for '{pdf_path.name}': {exc}"
            ) from exc

    @staticmethod
    def _render_page_as_tiles(page, dpi: int = 200) -> list[tuple[bytes, str]]:  # noqa: ANN001 - fitz.Page
        """Render one PDF page to PNG, splitting it into vertically
        overlapping tiles first if it's taller than a normal page — see
        `_TILE_HEIGHT_PT`'s docstring for why this matters."""
        import fitz  # PyMuPDF

        rect = page.rect
        if rect.height <= _TILE_HEIGHT_PT * _TILE_HEIGHT_TOLERANCE:
            pixmap = page.get_pixmap(dpi=dpi)
            return [(pixmap.tobytes("png"), "image/png")]

        tiles: list[tuple[bytes, str]] = []
        y = 0.0
        while True:
            y_end = min(y + _TILE_HEIGHT_PT, rect.height)
            clip = fitz.Rect(rect.x0, y, rect.x1, y_end)
            pixmap = page.get_pixmap(dpi=dpi, clip=clip)
            tiles.append((pixmap.tobytes("png"), "image/png"))
            if y_end >= rect.height:
                break
            y = y_end - _TILE_OVERLAP_PT
        return tiles
