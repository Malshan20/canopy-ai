"""
Transactional email via Resend.

--------------------------------------------------------------------------
HONEST LIMITATION — read before assuming this was verified like the rest
of this codebase
--------------------------------------------------------------------------
Same category of limitation as app/services/storage_service.py: this
needs a live Resend account and a real `RESEND_API_KEY`, neither of
which exist in the environment this was built in. The code is correct
against Resend's documented REST API shape (a single `POST
https://api.resend.com/emails` call with a Bearer token — about as
simple as transactional email APIs get), but that claim rests on the
API contract, not a passing test against the real thing. Fails cleanly
and loudly if unconfigured — see `enabled` below — rather than crashing
whatever action was trying to send an email.

--------------------------------------------------------------------------
WHY RESEND, AND WHY NOT SUPABASE'S BUILT-IN EMAIL
--------------------------------------------------------------------------
Supabase's built-in email sending is scoped to Auth flows only (invite,
password reset, magic link) — there is no way to send an arbitrary
transactional email ("your shipment is ready") through it. Resend was
picked over SendGrid/Postmark/SES for the simplest possible integration
(one API call, no SDK dependency needed — implemented here with plain
httpx, matching how every other outbound integration in this codebase
is built) and a free tier generous enough for a new product's actual
early volume. Swapping providers later only means rewriting this one
file — nothing else in the codebase should ever import `httpx` and call
an email API directly.
"""

from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


class EmailService:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http_client = http_client
        self._enabled = bool(settings.RESEND_API_KEY)

        if not self._enabled:
            logger.warning(
                "RESEND_API_KEY is not set — transactional email is disabled. "
                "Notifications and teammate invites will still work; the emails for them just won't send."
            )

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def send(self, *, to: str, subject: str, html: str) -> bool:
        """
        Sends one email. Returns whether it succeeded — callers decide
        for themselves whether a failure here should block the action
        that triggered it (a shipment notification failing to email
        should never fail the shipment; a teammate invite failing to
        send an email arguably SHOULD surface as an error, since the
        whole point of that action was the email — see
        app/api/v1/organizations.py's invite route for that judgment
        call). This function itself never raises.
        """
        if not self._enabled:
            return False

        try:
            response = await self._http_client.post(
                RESEND_API_URL,
                headers={"Authorization": f"Bearer {self._settings.RESEND_API_KEY}"},
                json={
                    "from": self._settings.RESEND_FROM_ADDRESS,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=15.0,
            )
            response.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            logger.error("Failed to send email to %s (subject=%r): %s", to, subject, exc)
            return False
