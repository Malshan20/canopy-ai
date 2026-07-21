"""
Recursive filesystem scanner for extracted ZIP contents.

Discovers supported image and PDF documents while ignoring executables,
nested archives, and any other unsupported file types.
"""

from __future__ import annotations

import mimetypes
import uuid
from pathlib import Path

from app.core.config import Settings
from app.core.logging import get_logger
from app.models.domain import DiscoveredFile
from app.schemas.documents import DocumentMetadata

logger = get_logger(__name__)


class FileScanner:
    """Walks an extraction directory and yields supported document files."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def scan(self, root_dir: Path) -> list[DiscoveredFile]:
        """Recursively scan `root_dir` and return all supported documents."""
        discovered: list[DiscoveredFile] = []
        supported = self._settings.supported_extensions

        for path in sorted(root_dir.rglob("*")):
            if not path.is_file():
                continue

            extension = path.suffix.lower()
            if extension not in supported:
                logger.info("Ignoring unsupported file: %s", path.relative_to(root_dir))
                continue

            size_bytes = path.stat().st_size
            mime_type, _ = mimetypes.guess_type(path.name)

            metadata = DocumentMetadata(
                document_id=str(uuid.uuid4()),
                filename=path.name,
                relative_path=str(path.relative_to(root_dir)),
                extension=extension,
                size_bytes=size_bytes,
                mime_type=mime_type or "application/octet-stream",
            )
            discovered.append(DiscoveredFile(metadata=metadata, absolute_path=path))

        logger.info("Scan complete: %d supported document(s) discovered.", len(discovered))
        return discovered
