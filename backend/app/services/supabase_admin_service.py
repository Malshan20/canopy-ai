"""
Direct calls to Supabase Auth's admin ("GoTrue") REST API.

Uses plain httpx rather than the `supabase-py` SDK, matching how every
other outbound integration in this codebase is built (see
storage_service.py, webhook_service.py) — one small, purpose-built
module per external service rather than a general-purpose SDK dependency
this codebase would otherwise never need.

Requires `SUPABASE_SERVICE_ROLE_KEY` — the same setting
storage_service.py already uses, so a deployment that has Storage
retention working already has everything this needs too.
"""

from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class SupabaseAdminService:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http_client = http_client
        self._enabled = bool(settings.SUPABASE_SERVICE_ROLE_KEY)

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def invite_user_by_email(self, email: str, redirect_to: str) -> str | None:
        """
        Creates an `auth.users` row for `email` and sends Supabase's own
        built-in invite email — the exact same call the separate admin
        panel project makes via the `supabase-py` client's
        `auth.admin.inviteUserByEmail()`, just via a direct REST call
        here since this backend doesn't depend on that SDK. Returns the
        new user's id, or `None` if the call fails or this service isn't
        configured (no service role key set).
        """
        if not self._enabled:
            logger.warning("Cannot invite %s — SUPABASE_SERVICE_ROLE_KEY is not configured.", email)
            return None

        try:
            response = await self._http_client.post(
                f"{self._settings.SUPABASE_URL}/auth/v1/invite",
                params={"redirect_to": redirect_to},
                headers={
                    "apikey": self._settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {self._settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                },
                json={"email": email},
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("id")
        except httpx.HTTPError as exc:
            logger.error("Failed to invite %s via Supabase Auth admin API: %s", email, exc)
            return None
