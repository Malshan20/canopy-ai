"""
Groq-powered document classification service.

Sends lightweight document signals (filename + extracted PDF text, where
available) to Groq's OpenAI-compatible chat completions API and returns
exactly one of the four allowed classification labels.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Final, get_args

import httpx

from app.core.config import Settings
from app.core.exceptions import (
    ClassificationServiceError,
    UpstreamRateLimitError,
    UpstreamTimeoutError,
)
from app.core.logging import get_logger
from app.models.domain import ClassificationResult
from app.schemas.documents import DocumentClassification

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Exact system prompt sent to Groq for every classification request.
# ---------------------------------------------------------------------------
GROQ_SYSTEM_PROMPT: Final[str] = """You are a supply-chain compliance document classification specialist working for an EU Deforestation Regulation (EUDR) compliance platform.

Your ONLY task is to classify a single supplier document into EXACTLY ONE of the following categories:

- weighbridge_receipt: a delivery/weighing ticket recording a crop weight for a specific transaction (farmer/supplier name, weight, date).
- land_deed: a land ownership or tenure record for a specific farm/plot (owner name, plot location or coordinates, area).
- tax_id: a tax registration or identification document for a company or individual (tax ID number, registered name).
- due_diligence_statement: an EUDR due diligence statement or deforestation-free evidence report — e.g. a "Due Diligence Statement", a certification body's "Deforestation-Free Evidence" / "Legal Compliance Evidence" report (such as documents issued by Rainforest Alliance, Fairtrade, or similar schemes), or any document that references Regulation (EU) 2023/1115, cites Article 3, lists an "Operator" name, an HS Code, a legal-compliance conformity table, or includes geolocation/plot evidence maps submitted in support of an EUDR declaration. This category exists specifically to catch real, highly relevant EUDR compliance evidence that is NOT a weighbridge receipt, land deed, or tax ID — do not default such documents to irrelevant.
- irrelevant: anything that does not clearly match one of the four categories above.

Rules you MUST follow:
1. You classify documents. You do not summarize, explain, or comment on them.
2. You must choose exactly one category from the list above. Never invent a new category or modify the spelling of a category.
3. If the document does not clearly match weighbridge_receipt, land_deed, tax_id, or due_diligence_statement, you must classify it as irrelevant.
4. Respond with ONLY the category label as plain text. No punctuation, no quotation marks, no explanations, no additional words, no Markdown formatting.
5. If you are uncertain, choose the closest matching category based on the strongest available evidence. If no evidence supports a specific category, respond with irrelevant.

Your response must be a single line containing only one of: weighbridge_receipt, land_deed, tax_id, due_diligence_statement, irrelevant"""

_VALID_LABELS: Final[frozenset[str]] = frozenset(get_args(DocumentClassification))
_PDF_TEXT_CHAR_LIMIT: Final[int] = 4000


class GroqClassifier:
    """Thin async wrapper around the Groq chat completions endpoint."""

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = http_client

    async def classify(
        self, filename: str, extension: str, absolute_path: Path
    ) -> ClassificationResult:
        """Classify a single document, returning a strictly validated classification label."""
        user_content = self._build_user_prompt(filename, extension, absolute_path)

        payload = {
            "model": self._settings.GROQ_MODEL,
            "temperature": 0.0,
            # `openai/gpt-oss-20b` (the configured GROQ_MODEL) is a reasoning
            # model: it spends generation tokens on an internal reasoning
            # pass *before* writing the final answer into `content`. With a
            # tiny token budget (this used to be `max_tokens: 16`),
            # generation gets cut off entirely during reasoning, so
            # `content` comes back empty on every single call regardless of
            # the document — not a classification decision, a token-budget
            # bug. `max_completion_tokens` (the current API's name for this
            # parameter — `max_tokens` is the older, now-secondary alias)
            # is set generously, and `reasoning_effort: "low"` keeps the
            # reasoning pass short for what is a simple 4-way
            # classification, so there's always room left for the label.
            "max_completion_tokens": 300,
            "reasoning_effort": "low",
            "messages": [
                {"role": "system", "content": GROQ_SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self._settings.GROQ_API_KEY}",
            "Content-Type": "application/json",
        }
        url = f"{self._settings.GROQ_API_BASE_URL}/chat/completions"

        raw_output = await self._request_with_retries(url, headers, payload, filename)

        if not raw_output:
            # An empty response is a technical failure of the classification
            # call, not the model choosing "irrelevant" — silently treating
            # it as "irrelevant" makes a real outage indistinguishable from
            # a genuine classification decision (both looked like a normal
            # "Skipped" document in the UI). Raising here instead surfaces
            # it honestly as `classification_failed` and lets the caller's
            # existing per-document error handling record `error_detail`.
            raise ClassificationServiceError(
                f"Groq returned an empty response for '{filename}' — this points to a "
                "request configuration issue (e.g. max_completion_tokens/reasoning_effort "
                f"too low for model '{self._settings.GROQ_MODEL}'), not a real classification."
            )

        label = self._sanitize_label(raw_output)

        logger.info("Classified '%s' as '%s'.", filename, label)
        return ClassificationResult(classification=label, raw_model_output=raw_output)

    async def _request_with_retries(
        self, url: str, headers: dict[str, str], payload: dict, filename: str
    ) -> str:
        last_error: Exception | None = None

        for attempt in range(1, self._settings.GROQ_MAX_RETRIES + 2):
            try:
                response = await self._client.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=self._settings.GROQ_REQUEST_TIMEOUT_SECONDS,
                )

                if response.status_code == 429:
                    raise UpstreamRateLimitError(
                        f"Groq rate limit reached while classifying '{filename}'."
                    )
                response.raise_for_status()

                data = response.json()
                content: str = data["choices"][0]["message"]["content"]
                return content.strip()

            except httpx.TimeoutException:
                last_error = UpstreamTimeoutError(
                    f"Groq request timed out while classifying '{filename}'."
                )
                logger.warning("Groq timeout on attempt %d for '%s'.", attempt, filename)
            except UpstreamRateLimitError as exc:
                last_error = exc
                logger.warning("Groq rate-limited on attempt %d for '%s'.", attempt, filename)
            except (httpx.HTTPStatusError, httpx.RequestError, KeyError, IndexError) as exc:
                last_error = ClassificationServiceError(
                    f"Groq classification failed for '{filename}': {exc}"
                )
                logger.warning("Groq error on attempt %d for '%s': %s", attempt, filename, exc)

            await asyncio.sleep(min(2**attempt * 0.5, 5.0))

        assert last_error is not None
        raise last_error

    @staticmethod
    def _sanitize_label(raw_output: str) -> DocumentClassification:
        """Coerce the model's raw text output into a strictly valid label, never trusting it as-is."""
        cleaned = raw_output.strip().lower().strip(".\"'`")
        if cleaned in _VALID_LABELS:
            return cleaned  # type: ignore[return-value]

        for label in _VALID_LABELS:
            if label in cleaned:
                return label  # type: ignore[return-value]

        logger.warning("Unrecognized Groq output '%s'; defaulting to 'irrelevant'.", raw_output)
        return "irrelevant"

    def _build_user_prompt(self, filename: str, extension: str, absolute_path: Path) -> str:
        parts = [f"Filename: {filename}", f"File extension: {extension}"]

        if extension == ".pdf":
            extracted_text = self._extract_pdf_text(absolute_path)
            if extracted_text:
                parts.append(f"Extracted PDF text (truncated):\n{extracted_text}")
            else:
                parts.append("No extractable text found in PDF (likely scanned/image-based).")
        else:
            parts.append("This is an image file. Base your classification on the filename only.")

        parts.append("\nClassify this document now. Respond with exactly one category label.")
        return "\n".join(parts)

    @staticmethod
    def _extract_pdf_text(pdf_path: Path) -> str:
        """Best-effort lightweight text extraction from the first few PDF pages."""
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(pdf_path))
            text_chunks: list[str] = []
            for page in reader.pages[:3]:
                text_chunks.append(page.extract_text() or "")
            combined = "\n".join(text_chunks).strip()
            return combined[:_PDF_TEXT_CHAR_LIMIT]
        except Exception as exc:  # noqa: BLE001 - text extraction is best-effort only
            logger.warning("PDF text extraction failed for '%s': %s", pdf_path.name, exc)
            return ""
