"""
Webhook dispatch — HMAC-signed POST notifications when a shipment
finishes processing.

Delivery is best-effort and fire-and-forget with respect to the upload
request: same reliability posture as audit logging and storage upload
elsewhere in this codebase. A slow or failing customer endpoint must
never make a CanoryAI upload request slower or fail because of it.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.logging import get_logger

logger = get_logger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 10.0
SIGNATURE_HEADER = "X-CanoryAI-Signature"


def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """
    HMAC-SHA256 signature, hex-encoded — the receiving end recomputes
    this over the raw request body using the same secret (shown once at
    webhook creation, same as an API key) to verify the request actually
    came from CanoryAI and wasn't forged or tampered with in transit.
    """
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


class WebhookService:
    def __init__(self, http_client: httpx.AsyncClient, db_session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._http_client = http_client
        self._db_session_factory = db_session_factory

    async def dispatch_shipment_completed(
        self, *, organization_id: str, user_id: str, shipment_id: str, readiness: str, documents_processed: int
    ) -> None:
        """
        Fires `shipment.completed` to every enabled webhook for this
        organization. Looks up the webhook list itself (rather than
        requiring the caller to already have one) via its own RLS-scoped
        session, so this can be called from anywhere in the pipeline with
        just organization/user context — the same self-contained shape as
        `AuditService.log_event`.
        """
        claims = json.dumps({"sub": user_id, "organization_id": organization_id, "role": "authenticated"})

        try:
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"), {"claims": claims}
                    )
                    result = await session.execute(
                        text("SELECT id, url, secret FROM webhooks WHERE organization_id = :org_id AND enabled = true"),
                        {"org_id": organization_id},
                    )
                    webhooks = result.all()
        except Exception as exc:  # noqa: BLE001 - must never crash shipment processing
            logger.error("Shipment %s: failed to look up webhooks: %s", shipment_id, exc)
            return

        if not webhooks:
            return

        payload = {
            "event": "shipment.completed",
            "shipment_id": shipment_id,
            "organization_id": organization_id,
            "readiness": readiness,
            "documents_processed": documents_processed,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")

        for webhook in webhooks:
            await self._deliver_one(
                webhook_id=str(webhook.id),
                url=webhook.url,
                secret=webhook.secret,
                payload_bytes=payload_bytes,
                organization_id=organization_id,
                user_id=user_id,
            )

    async def _deliver_one(
        self, *, webhook_id: str, url: str, secret: str, payload_bytes: bytes, organization_id: str, user_id: str
    ) -> None:
        signature = sign_payload(secret, payload_bytes)
        status_code: int | None = None

        try:
            response = await self._http_client.post(
                url,
                content=payload_bytes,
                headers={"Content-Type": "application/json", SIGNATURE_HEADER: signature},
                timeout=WEBHOOK_TIMEOUT_SECONDS,
            )
            status_code = response.status_code
            if not response.is_success:
                logger.warning("Webhook %s delivery to %s returned %d", webhook_id, url, status_code)
        except httpx.HTTPError as exc:
            logger.warning("Webhook %s delivery to %s failed: %s", webhook_id, url, exc)

        # Best-effort delivery-status touch, same reliability posture as
        # everywhere else — never lets a logging failure mask the actual
        # delivery attempt that already happened above.
        try:
            claims = json.dumps({"sub": user_id, "organization_id": organization_id, "role": "authenticated"})
            async with self._db_session_factory() as session:
                async with session.begin():
                    await session.execute(
                        text("SELECT set_config('request.jwt.claims', :claims, true)"), {"claims": claims}
                    )
                    await session.execute(
                        text(
                            "UPDATE webhooks SET last_triggered_at = now(), last_status_code = :status_code "
                            "WHERE id = :id"
                        ),
                        {"status_code": status_code, "id": webhook_id},
                    )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to update delivery status for webhook %s: %s", webhook_id, exc)
