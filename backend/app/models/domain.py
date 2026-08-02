"""
Internal domain models.

These are process-internal representations, distinct from the public
Pydantic API schemas in `app.schemas`. Keeping them separate lets the
internal processing pipeline evolve independently of the public API
contract (e.g. adding pipeline-only fields without touching the API).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.schemas.documents import DocumentClassification, DocumentMetadata


@dataclass(slots=True)
class DiscoveredFile:
    """A single file discovered while scanning an extracted ZIP archive."""

    metadata: DocumentMetadata
    absolute_path: Path


@dataclass(slots=True)
class ClassificationResult:
    """Result of sending a single document to the Groq classifier."""

    classification: DocumentClassification
    raw_model_output: str
