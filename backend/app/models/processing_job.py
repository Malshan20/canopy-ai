"""
ProcessingJob ORM model — backs real priority processing.

--------------------------------------------------------------------------
WHY POSTGRES AS THE QUEUE, NOT REDIS/CELERY
--------------------------------------------------------------------------
Every other piece of "needs a shared store to scale past one worker" in
this codebase (the in-memory shipment cache, the API rate limiter) is
documented as needing Redis *eventually*, but deliberately doesn't
require standing up new infrastructure today. This follows the same
principle: `SELECT ... FOR UPDATE SKIP LOCKED` gives genuine
safe-under-concurrency job claiming using the Postgres database that
already exists, with no new service to deploy, monitor, or pay for. This
is a real trade-off, not a shortcut disguised as one — a dedicated queue
(Celery/RQ/arq + Redis) would give better throughput at high volume, job
retries with backoff, and distributed workers across machines. This
implementation runs its worker loop as a single background asyncio task
inside the same process as the API server (see `main.py`), which is
consistent with — and bound by — the exact same `WEB_CONCURRENCY=1`
constraint documented on `InMemoryShipmentStore`: multiple worker
processes would each run their own independent claim loop, which
`SKIP LOCKED` makes *safe* (no two workers can ever claim the same job)
but not *efficient* (no cross-process prioritization). Moving to a real
queue is the right next step if throughput ever actually demands it;
this is the honest, working version for what this system needs today.

--------------------------------------------------------------------------
WHAT "PRIORITY" MEANS HERE
--------------------------------------------------------------------------
`priority` is derived once, at enqueue time, from the organization's plan
(see `app/services/plan_limits.py` for the same plan concept driving
shipment quotas) — Enterprise/Custom jobs are claimed before Growth jobs
queued earlier, but never starve Growth jobs entirely, since claiming is
still `ORDER BY priority DESC, created_at ASC`: within the same priority
tier, strict first-in-first-out still applies.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

VALID_STATUSES = ("queued", "processing", "completed", "failed")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        CheckConstraint(f"status IN {VALID_STATUSES}", name="ck_processing_jobs_valid_status"),
        Index("ix_processing_jobs_organization_id", "organization_id"),
        # The exact index the claim query's ORDER BY relies on — without
        # it, claiming degrades to a full table scan under real load.
        Index("ix_processing_jobs_claim_order", "status", "priority", "created_at"),
        {
            "comment": (
                "Async shipment-processing job queue. Claimed via "
                "SELECT ... FOR UPDATE SKIP LOCKED — see this model's module docstring."
            )
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False
    )
    # Higher = claimed sooner. Derived once at enqueue time from the
    # organization's plan (see plan_limits.PRIORITY_BY_PLAN) — not
    # re-evaluated if the plan changes after a job is already queued.
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")

    zip_path: Mapped[str] = mapped_column(Text, nullable=False)
    source_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    declared_weight_kg: Mapped[float] = mapped_column(Float, nullable=False)

    shipment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    error_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
