"""
Original document retention via Supabase Storage.

--------------------------------------------------------------------------
HONEST LIMITATION — read before assuming this was verified like everything
else in this codebase
--------------------------------------------------------------------------
Every other piece of this backend was tested against a real running
instance of its dependency (a real local PostgreSQL database, a real
signed JWT, a real cross-tenant proof). This module cannot be tested that
way in this environment: it requires a live Supabase project's Storage
API, which needs real network access and a real `SUPABASE_SERVICE_ROLE_KEY`,
neither of which exist here. The code below is correct against Supabase's
documented Storage REST API shape, but — unlike the rest of this
codebase — that claim is based on the API contract, not a passing test
against the real thing. Treat this module as needing a first real-world
smoke test before depending on it in production.

--------------------------------------------------------------------------
WHY THE SERVICE ROLE KEY, NOT THE ANON KEY
--------------------------------------------------------------------------
Uploads here happen from the backend on behalf of whichever organization
is processing a shipment — there's no single end-user's browser session
initiating each individual file write the way there is for, say, a
Supabase Auth-scoped client upload. The service role key (server-side
only, never exposed to a browser) is what lets the backend write into a
bucket without needing per-request user-scoped Storage policies. Get this
from Supabase: Project Settings -> API -> service_role key ("secret",
not the "anon" "public" one).

--------------------------------------------------------------------------
REQUIRED SUPABASE SETUP (one-time, in your project's dashboard)
--------------------------------------------------------------------------
1. Storage -> New bucket -> name it to match `SUPABASE_STORAGE_BUCKET`
   (default: "shipment-documents") -> make it **private** (not public) —
   these are the original supplier documents, not something to serve
   over an unauthenticated public URL.
2. No bucket-level RLS policy setup is required for this specific
   integration, since all access goes through the service role key,
   which bypasses Storage's RLS the same way it bypasses table RLS
   elsewhere in this codebase.
"""

from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageService:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http_client = http_client
        self._enabled = bool(settings.SUPABASE_SERVICE_ROLE_KEY)

        if not self._enabled:
            logger.warning(
                "SUPABASE_SERVICE_ROLE_KEY is not set — original document retention is disabled. "
                "Shipments will still process normally; raw_documents.storage_path will simply stay null."
            )

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def upload_document(
        self, *, organization_id: str, shipment_id: str, filename: str, content: bytes, content_type: str
    ) -> str | None:
        """
        Uploads one document's original bytes to Supabase Storage.
        Returns the storage path on success, or `None` on any failure —
        this must never raise, and must never block or fail shipment
        processing over a storage hiccup (same reliability posture as
        audit logging elsewhere in this codebase). Path shape:
        `{organization_id}/{shipment_id}/{filename}` — organization-first,
        so a bucket-level policy scoping by path prefix is possible later
        without restructuring anything already uploaded.
        """
        if not self._enabled:
            return None

        storage_path = f"{organization_id}/{shipment_id}/{filename}"
        url = (
            f"{self._settings.SUPABASE_URL}/storage/v1/object/"
            f"{self._settings.SUPABASE_STORAGE_BUCKET}/{storage_path}"
        )

        try:
            response = await self._http_client.post(
                url,
                content=content,
                headers={
                    "Authorization": f"Bearer {self._settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": content_type,
                    "x-upsert": "true",
                },
                timeout=30.0,
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.error(
                "Failed to upload document to Supabase Storage (shipment=%s, file=%s): %s",
                shipment_id,
                filename,
                exc,
            )
            return None

        return storage_path
