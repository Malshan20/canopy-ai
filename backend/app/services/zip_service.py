"""
ZIP ingestion service.

Responsible for:
    * Streaming uploaded ZIP archives to disk while enforcing size limits.
    * Validating ZIP integrity and basic file signature.
    * Safely extracting archives to an isolated temporary directory while
      defending against Zip Slip / path traversal attacks and archive bombs.
"""

from __future__ import annotations

import asyncio
import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.core.exceptions import (
    CorruptedZipError,
    EmptyZipError,
    InvalidUploadError,
    TooManyFilesError,
    UnsafeZipContentError,
    ZipTooLargeError,
)
from app.core.logging import get_logger

logger = get_logger(__name__)

_ZIP_MAGIC_BYTES: bytes = b"PK\x03\x04"
_CHUNK_SIZE: int = 1024 * 1024  # 1 MB streaming chunks


class ZipService:
    """Handles secure validation, persistence, and extraction of ZIP uploads."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._settings.TEMP_DIR_ROOT.mkdir(parents=True, exist_ok=True)

    async def persist_upload(self, upload: UploadFile) -> Path:
        """
        Stream the uploaded file to disk while enforcing the max size limit.
        The file is never fully buffered in memory at once.
        """
        if not upload.filename:
            raise InvalidUploadError("No filename was provided with the upload.")

        if not upload.filename.lower().endswith(".zip"):
            raise InvalidUploadError("Only .zip archives are accepted.")

        job_dir = self._settings.TEMP_DIR_ROOT / f"job_{uuid.uuid4().hex}"
        job_dir.mkdir(parents=True, exist_ok=True)
        destination = job_dir / "upload.zip"

        total_bytes = 0
        max_bytes = self._settings.MAX_ZIP_SIZE_BYTES

        try:
            with destination.open("wb") as buffer:
                while chunk := await upload.read(_CHUNK_SIZE):
                    total_bytes += len(chunk)
                    if total_bytes > max_bytes:
                        raise ZipTooLargeError(
                            f"ZIP archive exceeds the maximum allowed size of "
                            f"{max_bytes // (1024 * 1024)} MB."
                        )
                    buffer.write(chunk)
        except ZipTooLargeError:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise
        finally:
            await upload.close()

        if total_bytes == 0:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise InvalidUploadError("The uploaded file is empty.")

        with destination.open("rb") as f:
            magic = f.read(4)
        if magic != _ZIP_MAGIC_BYTES:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise CorruptedZipError("The uploaded file is not a valid ZIP archive.")

        logger.info("ZIP persisted to %s (%d bytes).", destination, total_bytes)
        return destination

    async def extract(self, zip_path: Path) -> Path:
        """Safely extract a ZIP archive to a fresh temp directory (offloaded to a thread)."""
        extract_dir = zip_path.parent / "extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(self._extract_sync, zip_path, extract_dir)
        return extract_dir

    def _extract_sync(self, zip_path: Path, extract_dir: Path) -> None:
        try:
            with zipfile.ZipFile(zip_path, "r") as archive:
                bad_file = archive.testzip()
                if bad_file is not None:
                    raise CorruptedZipError(
                        f"Archive integrity check failed on member: {bad_file}"
                    )

                members = archive.infolist()
                real_members = [m for m in members if not m.is_dir()]
                if not real_members:
                    raise EmptyZipError("The ZIP archive is empty.")

                if len(real_members) > self._settings.MAX_FILES_PER_ZIP:
                    raise TooManyFilesError(
                        f"Archive contains {len(real_members)} files, exceeding the "
                        f"limit of {self._settings.MAX_FILES_PER_ZIP}."
                    )

                resolved_root = extract_dir.resolve()

                for member in real_members:
                    self._validate_member_safety(member.filename, resolved_root, extract_dir)

                    if member.file_size > self._settings.MAX_SINGLE_FILE_SIZE_BYTES:
                        logger.warning(
                            "Skipping oversized file inside archive: %s (%d bytes)",
                            member.filename,
                            member.file_size,
                        )
                        continue

                    archive.extract(member, path=extract_dir)

        except zipfile.BadZipFile as exc:
            raise CorruptedZipError("The ZIP archive is corrupted or unreadable.") from exc

    @staticmethod
    def _validate_member_safety(
        member_filename: str, resolved_root: Path, extract_dir: Path
    ) -> None:
        """
        Defend against Zip Slip / path traversal by ensuring every extracted
        member resolves to a path strictly inside the extraction root, and by
        rejecting absolute paths or ".." segments outright.
        """
        if Path(member_filename).is_absolute() or ".." in Path(member_filename).parts:
            raise UnsafeZipContentError(
                f"Archive member '{member_filename}' contains unsafe path segments."
            )

        candidate = (extract_dir / member_filename).resolve()
        try:
            candidate.relative_to(resolved_root)
        except ValueError as exc:
            raise UnsafeZipContentError(
                f"Archive member '{member_filename}' resolves outside the "
                "extraction root and was rejected."
            ) from exc

    def cleanup(self, job_dir: Path) -> None:
        """Best-effort cleanup of a job's entire temporary working directory."""
        shutil.rmtree(job_dir, ignore_errors=True)
