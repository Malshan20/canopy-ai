"""
Public, unauthenticated auth-adjacent routes — currently just the SSO
domain lookup a login form needs to call *before* a user has any
session at all. Deliberately its own small router rather than folded
into organizations.py, since every route in that file assumes an
authenticated caller and this one, by definition, can't.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.api.v1.dependencies import DbSessionFactoryDep, SettingsDep
from app.services.sso_service import SsoService

router = APIRouter(prefix="/auth", tags=["Auth"])


class SsoLookupResponse(BaseModel):
    sso_enabled: bool
    redirect_url: str | None = None


@router.get(
    "/sso-lookup",
    response_model=SsoLookupResponse,
    summary="Check whether an email domain has SSO configured, and get the login redirect URL if so.",
)
async def sso_lookup(domain: str, db_session_factory: DbSessionFactoryDep, settings: SettingsDep) -> SsoLookupResponse:
    """
    Called by the login form as soon as a user finishes typing their
    email, before any password field is even shown — this has to work
    with zero authentication, since checking "should I show you a
    password field" can't itself require being logged in.

    Deliberately bypasses the normal RlsSessionDep pattern (there's no
    authenticated caller to scope a session to) and queries directly
    with the plain db_session_factory instead — the only information
    this returns is "does this domain use SSO", which isn't sensitive
    enough to need per-tenant RLS scoping in the first place.
    """
    async with db_session_factory() as session:
        result = await session.execute(text("SELECT * FROM lookup_sso_domain(:domain)"), {"domain": domain.lower().strip()})
        row = result.first()

    if row is None:
        return SsoLookupResponse(sso_enabled=False)

    sso_service = SsoService(settings)
    redirect_url = sso_service.build_sso_redirect_url(
        domain=row.sso_domain, redirect_to=f"{settings.frontend_origins[0]}/dashboard"
    )
    return SsoLookupResponse(sso_enabled=True, redirect_url=redirect_url)
