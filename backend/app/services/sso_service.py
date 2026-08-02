"""
SAML SSO via Supabase Auth's enterprise SSO feature.

--------------------------------------------------------------------------
HONEST LIMITATION — the strongest version of this caveat anywhere in this
codebase, please actually read it
--------------------------------------------------------------------------
Every other "can't fully test" module here (storage_service.py,
email_service.py) at least has a documented, stable REST API contract to
build against. This one is weaker than that: Supabase's own SSO
documentation describes configuration happening through the `supabase
sso` CLI subcommands, not a directly-documented REST endpoint. The paths
used below (`/admin/sso/providers` on GoTrue, and `/auth/v1/sso` for
initiating a login) follow the general shape of Supabase Auth's admin
API family and of documented SP-initiated SSO flows elsewhere in their
docs — but unlike everywhere else in this codebase, this specific
endpoint shape has not been directly confirmed against current API
reference documentation, only inferred from the surrounding feature
docs. Before relying on this in production: verify these exact paths
and payloads against Supabase's current Auth API reference, or against
the output of `supabase sso` CLI commands run with `--debug`, before
assuming they're correct as written.

--------------------------------------------------------------------------
WHAT'S ACTUALLY REAL HERE
--------------------------------------------------------------------------
The organization-level data model (Organization.sso_enabled/sso_domain/
sso_provider_id — see that model and its migration), the uniqueness
constraint preventing two organizations from claiming the same email
domain, and the login-routing decision logic in
app/api/v1/auth_public.py are all real, tested, and independent of
whether the exact Supabase API calls below are correct. If the specific
paths here turn out to be wrong, only THIS file needs to change — every
other piece was built to not depend on the details being right.

--------------------------------------------------------------------------
REQUIRED SUPABASE SETUP BEFORE ANY OF THIS CAN WORK AT ALL
--------------------------------------------------------------------------
1. SSO is a Supabase Pro-plan-and-above feature (~$25/mo minimum,
   metered per SSO monthly active user on top) — confirmed against
   Supabase's current pricing docs, not assumed.
2. SAML 2.0 support must be explicitly enabled on the Supabase project
   (Dashboard -> Authentication -> Providers -> SAML 2.0).
3. Each customer must provide their own IdP's SAML metadata (a URL or
   an XML file) — this cannot be configured without it, by definition.
"""

from __future__ import annotations

import httpx

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class SsoService:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._http_client = http_client
        self._enabled = bool(settings.SUPABASE_SERVICE_ROLE_KEY)

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def register_provider(self, *, metadata_url: str, domain: str) -> str | None:
        """
        Registers a customer's SAML IdP with Supabase and associates it
        with an email domain for SP-initiated login routing. Returns
        Supabase's internal provider id (store this as
        Organization.sso_provider_id) or None on failure. Called only
        from the separate admin panel project's SSO configuration flow
        — never customer-facing, since it requires the customer's real
        IdP metadata to have already been collected out of band.
        """
        if not self._enabled:
            logger.warning("Cannot register SSO provider for domain %s — service role key not configured.", domain)
            return None
        assert self._http_client is not None, "SsoService needs an http_client for register_provider()"

        try:
            response = await self._http_client.post(
                f"{self._settings.SUPABASE_URL}/auth/v1/admin/sso/providers",
                headers={
                    "apikey": self._settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {self._settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "type": "saml",
                    "metadata_url": metadata_url,
                    "domains": [domain],
                },
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("id")
        except httpx.HTTPError as exc:
            logger.error("Failed to register SSO provider for domain %s: %s", domain, exc)
            return None

    async def remove_provider(self, provider_id: str) -> bool:
        if not self._enabled:
            return False
        assert self._http_client is not None, "SsoService needs an http_client for remove_provider()"
        try:
            response = await self._http_client.delete(
                f"{self._settings.SUPABASE_URL}/auth/v1/admin/sso/providers/{provider_id}",
                headers={
                    "apikey": self._settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {self._settings.SUPABASE_SERVICE_ROLE_KEY}",
                },
                timeout=15.0,
            )
            response.raise_for_status()
            return True
        except httpx.HTTPError as exc:
            logger.error("Failed to remove SSO provider %s: %s", provider_id, exc)
            return False

    def build_sso_redirect_url(self, domain: str, redirect_to: str) -> str:
        """
        The URL the frontend sends a browser to in order to *start* an
        SP-initiated SSO login for `domain`. This is a GET redirect, not
        an API call this backend makes itself — Supabase's Auth server
        handles the actual SAML handshake with the customer's IdP, and
        redirects back to `redirect_to` with a session once it's done.
        """
        return f"{self._settings.SUPABASE_URL}/auth/v1/sso?domain={domain}&redirect_to={redirect_to}"
