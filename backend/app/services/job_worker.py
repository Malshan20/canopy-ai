"""
Background worker for the priority processing queue.

Runs as a single asyncio task inside the same process as the API server
(started/stopped in `main.py`'s lifespan) — see
`app/models/processing_job.py`'s module docstring for the full reasoning
behind this choice over a separate Celery/RQ worker process, and its
`WEB_CONCURRENCY=1` caveat.

Loop shape: poll for a claimable job every `POLL_INTERVAL_SECONDS` when
idle; when one is claimed, process it immediately with no delay, then
immediately poll again (in case more are queued) before going back to
waiting. This means the poll interval only affects "how long until an
empty queue notices a new job", not throughput while jobs are actually
queued.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

from app.core.logging import get_logger
from app.services.shipment_processor import ShipmentProcessingService

logger = get_logger(__name__)

POLL_INTERVAL_SECONDS = 2.0


class JobWorker:
    def __init__(
        self,
        db_session_factory: async_sessionmaker[AsyncSession],
        processing_service: ShipmentProcessingService,
    ) -> None:
        self._db_session_factory = db_session_factory
        self._processing_service = processing_service
        self._task: asyncio.Task | None = None
        self._stopping = False

    def start(self) -> None:
        self._stopping = False
        self._task = asyncio.create_task(self._run_loop(), name="job-worker")
        logger.info("JobWorker started.")

    async def stop(self) -> None:
        self._stopping = True
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("JobWorker stopped.")

    async def _run_loop(self) -> None:
        while not self._stopping:
            try:
                claimed = await self._claim_next_job()
                if claimed is None:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue
                await self._process_claimed_job(claimed)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - one bad job must never kill the whole worker loop
                logger.exception("JobWorker: unhandled error in run loop, continuing.")
                await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _claim_next_job(self) -> dict | None:
        async with self._db_session_factory() as session:
            async with session.begin():
                result = await session.execute(text("SELECT * FROM claim_next_processing_job()"))
                row = result.first()
        if row is None:
            return None
        return dict(row._mapping)

    async def _process_claimed_job(self, job: dict) -> None:
        job_id = str(job["id"])
        organization_id = str(job["organization_id"])
        user_id = str(job["created_by"])
        zip_path = Path(job["zip_path"])

        logger.info("JobWorker: claimed job %s (org=%s, file=%s).", job_id, organization_id, job["source_filename"])

        try:
            response = await self._processing_service.process_from_zip_path(
                zip_path=zip_path,
                source_filename=job["source_filename"],
                total_declared_weight_kg=job["declared_weight_kg"],
                organization_id=organization_id,
                user_id=user_id,
            )
        except Exception as exc:  # noqa: BLE001 - a failed job must be recorded, not silently dropped
            logger.error("JobWorker: job %s failed: %s", job_id, exc)
            await self._fail_job(job_id, str(exc))
            return

        await self._complete_job(job_id, response.shipment_id, response.model_dump(mode="json"))

    async def _complete_job(self, job_id: str, shipment_id: str, result_payload: dict) -> None:
        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT complete_processing_job(:job_id, :shipment_id, :payload)"),
                        {"job_id": job_id, "shipment_id": shipment_id, "payload": json.dumps(result_payload)},
                    )
        except Exception:  # noqa: BLE001
            logger.exception(
                "JobWorker: failed to mark job %s completed (shipment %s was still created).", job_id, shipment_id
            )

    async def _fail_job(self, job_id: str, error_detail: str) -> None:
        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT fail_processing_job(:job_id, :error_detail)"),
                        {"job_id": job_id, "error_detail": error_detail[:2000]},
                    )
        except Exception:  # noqa: BLE001
            logger.exception("JobWorker: failed to mark job %s failed.", job_id)
