"""
Authentication & multi-tenancy authorization.

This module is CanoryAI's zero-trust boundary: every protected route
depends on `get_current_user`, which (1) validates the caller's Supabase
JWT itself rather than trusting the frontend, (2) resolves which
organization the request is allowed to act as via a real `user_roles`
lookup rather than trusting a client-supplied organization id, and
(3) hands routes an RLS-scoped session — a database session where
PostgreSQL's own Row Level Security is genuinely enforced for that user,
not just an application-layer filter.

--------------------------------------------------------------------------
SERVICE ROLE vs. USER JWT — READ BEFORE ADDING A NEW DATABASE CALL
--------------------------------------------------------------------------
CanoryAI has exactly two ways to talk to the database:

1. **RLS-scoped, per-request session** (`get_rls_session` /
   `RlsScopedSessionDep`) — the default and correct choice for essentially
   everything. Opens a session and sets `request.jwt.claims` to the
   *verified* user_id + organization_id this request resolved via
   `get_current_user`, so every query in that session is subject to the
   same Postgres RLS policies a direct Supabase client query would be.
   A bug that forgets a `WHERE organization_id = ...` clause here still
   cannot leak cross-tenant data — the database itself won't return rows
   outside the caller's organization no matter what SQL the app issues.

2. **Service role** (connected as a role with `BYPASSRLS`, mirroring
   Supabase's real `service_role` key) — bypasses RLS entirely. This is
   *only* ever appropriate for a narrow set of system-initiated operations
   that have no single end-user's tenant context to scope to, or that are
   legitimately cross-tenant by design: Alembic migrations, the specific
   `SECURITY DEFINER` bootstrap functions defined in the multi-tenancy
   migration (org creation, role resolution helpers), and any future
   background job with no incoming request. It is **never** used to serve
   an ordinary authenticated API request — doing so would make RLS
   decorative for that entire code path, silently defeating the
   "database-level" half of the zero-trust requirement even if every
   other layer is implemented correctly.

If you're adding a new route and aren't sure which to use: use the
RLS-scoped session. If you think you need the service role, that's a
signal to stop and reconsider — genuine service-role use cases are rare
and should be reviewed, not the default.
"""

from __future__ import annotations

import functools
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, AsyncIterator

import jwt
from fastapi import Depends, Header
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings, get_settings
from app.core.exceptions import (
    DemoExpiredError,
    InsufficientRoleError,
    InvalidTokenError,
    MissingCredentialsError,
    NoOrganizationError,
    RateLimitExceededError,
)
from app.core.logging import get_logger
from app.db.base import get_db_session_factory
from app.services.api_key_service import hash_api_key, looks_like_api_key
from app.services.rate_limiter import api_key_rate_limiter

logger = get_logger(__name__)

_BEARER_PREFIX = "Bearer "

DbSessionFactoryDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_db_session_factory)]


@dataclass(slots=True, frozen=True)
class CurrentUser:
    """
    The authenticated, organization-resolved identity of the caller.

    `auth_method` and `api_key_id` distinguish an interactive browser
    session (`"jwt"`) from a programmatic integration (`"api_key"`) —
    used today only for rate limiting, but kept on every `CurrentUser` so
    any future route can tell the two apart without re-deriving it (e.g.
    if some action should only ever be performed by a human, not an
    unattended integration).
    """

    user_id: str
    organization_id: str
    role: str
    email: str | None = None
    auth_method: str = "jwt"
    api_key_id: str | None = None


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith(_BEARER_PREFIX):
        raise MissingCredentialsError()
    token = authorization[len(_BEARER_PREFIX) :].strip()
    if not token:
        raise MissingCredentialsError()
    return token


@functools.lru_cache(maxsize=1)
def _get_jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    """
    One cached PyJWKClient per (in practice, the single) Supabase project
    this backend talks to — PyJWKClient itself caches the fetched JWKS in
    memory and only re-fetches when it sees a `kid` it doesn't recognize
    (e.g. after a key rotation), so this is not a network call on every
    request. `lru_cache` here just avoids constructing a new client (and
    losing that cache) on every single call to `_decode_supabase_jwt`.
    """
    return jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json")


def _decode_supabase_jwt(token: str, settings: Settings) -> dict:
    """
    Verify and decode a Supabase access token.

    Supabase projects created before ~May 2025 sign access tokens with a
    shared HS256 secret (`SUPABASE_JWT_SECRET`) by default; projects
    created after that default to asymmetric ES256 signing keys verified
    against a published JWKS instead — and CLI/platform updates since
    have pushed existing HS256 projects toward the same default. Which
    one a given project actually uses isn't something this backend can
    assume from its own settings alone, so this reads the `alg` the
    token itself declares in its header and verifies accordingly, rather
    than hardcoding one algorithm and rejecting the other outright with
    "The specified alg value is not allowed" — the exact failure this
    replaced.

    HS256 verification is a pure local computation (no network call).
    ES256/RS256 verification needs the project's public key, fetched
    (and cached — see `_get_jwks_client`) from Supabase's JWKS endpoint.
    """
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"Access token is invalid: {exc}") from exc

    algorithm = unverified_header.get("alg")

    try:
        if algorithm in ("ES256", "RS256"):
            jwks_client = _get_jwks_client(settings.SUPABASE_URL)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=[algorithm],
                audience=settings.SUPABASE_JWT_AUDIENCE,
            )
        if not settings.SUPABASE_JWT_SECRET:
            raise InvalidTokenError(
                "Access token is invalid: this is an HS256 token but SUPABASE_JWT_SECRET is not "
                "configured. Set it from Project Settings -> API -> JWT Settings."
            )
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.SUPABASE_JWT_AUDIENCE,
        )
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError("Access token has expired.") from exc
    except jwt.PyJWKClientError as exc:
        raise InvalidTokenError(f"Access token is invalid: could not resolve its signing key ({exc}).") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError(f"Access token is invalid: {exc}") from exc


async def _check_demo_not_expired(
    session_factory: async_sessionmaker[AsyncSession], organization_id: str
) -> None:
    """
    Locks out every request for a demo organization once its 7-day
    window has passed — checked here, in the one place every
    authenticated request already flows through, rather than added to
    each individual route. A demo that expired mid-session stops working
    on the very next request, not just the next login.

    A deliberately separate, minimal query rather than folded into
    `_fetch_user_memberships`'s existing SQL: that query is relied on by
    every authenticated request in the app and is correct and working
    today, so it stays untouched — this adds one small, additional
    lookup instead of risking it. Silently does nothing (never raises)
    if the organization can't be found or isn't on the demo plan at
    all — `growth`/`enterprise`/`custom` organizations are completely
    unaffected by this function's existence.
    """
    async with session_factory() as session:
        result = await session.execute(
            text("SELECT plan, demo_expires_at FROM organizations WHERE id = :id"),
            {"id": organization_id},
        )
        row = result.first()

    if row is None or row.plan != "demo" or row.demo_expires_at is None:
        return

    expires_at = row.demo_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > expires_at:
        raise DemoExpiredError()


async def get_current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    session_factory: DbSessionFactoryDep,
    authorization: Annotated[str | None, Header()] = None,
    x_organization_id: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    """
    Validate the caller's credential and resolve their organization
    membership. This is CanoryAI's primary FastAPI auth dependency —
    every protected route depends on it, directly or via the RLS-scoped
    session dependency. Accepts two credential shapes behind the same
    `Authorization: Bearer <token>` header: a Supabase JWT (interactive
    browser sessions) or a CanoryAI API key (`cnry_live_...`, programmatic
    integrations — see `app/services/api_key_service.py` and
    `_authenticate_api_key` below). The two are distinguished by shape
    before either is parsed, so this never tries to JWT-decode an API key
    or hash-lookup a JWT.

    JWT steps (matching the zero-trust chain in this module's docstring):
      1. Parse and cryptographically verify the bearer token.
      2. Look up the caller's organization membership(s) in `user_roles`,
         via a session scoped to *just* their verified user_id (so this
         lookup is itself RLS-protected — a user can only ever resolve
         their own membership rows, never anyone else's).
      3. If the caller belongs to more than one organization, an
         `X-Organization-Id` header selects which one this request acts
         as — verified against their real memberships, never trusted
         blindly. If they belong to exactly one, that's used by default.
    """
    token = _extract_bearer_token(authorization)

    if looks_like_api_key(token):
        return await _authenticate_api_key(token, session_factory)

    claims = _decode_supabase_jwt(token, settings)

    user_id = claims.get("sub")
    if not user_id:
        raise InvalidTokenError("Access token is missing a 'sub' claim.")

    memberships = await _fetch_user_memberships(session_factory, user_id)

    if not memberships:
        raise NoOrganizationError()

    if x_organization_id:
        selected = next((m for m in memberships if m["organization_id"] == x_organization_id), None)
        if selected is None:
            # Deliberately the same error as "no organization at all" —
            # never confirm or deny that an organization id exists to a
            # caller who isn't a member of it.
            raise NoOrganizationError()
    else:
        selected = memberships[0]

    await _check_demo_not_expired(session_factory, selected["organization_id"])

    return CurrentUser(
        user_id=user_id,
        organization_id=selected["organization_id"],
        role=selected["role"],
        email=claims.get("email"),
        auth_method="jwt",
    )


async def _authenticate_api_key(token: str, session_factory: async_sessionmaker[AsyncSession]) -> CurrentUser:
    """
    Resolves a `cnry_live_...` API key to a `CurrentUser`. Deliberately
    constructs the *exact same claims shape* (`sub` = the creating user's
    id, `organization_id`) that JWT auth would — meaning
    `get_user_organization_id()` and every existing RLS policy work
    completely unchanged for API-key-authenticated requests; no policy
    anywhere in the schema needed to know API keys exist.

    The key's effective role is the creating user's *current* role in
    that organization, re-checked on every single call via
    `_fetch_user_memberships` — never a role frozen onto the key at
    creation time. See the api_keys migration's docstring for why.
    """
    key_hash = hash_api_key(token)

    async with session_factory() as session:
        async with session.begin():
            result = await session.execute(
                text("SELECT id, organization_id, created_by FROM resolve_api_key(:key_hash)"),
                {"key_hash": key_hash},
            )
            row = result.first()

    if row is None:
        raise InvalidTokenError("This API key is invalid or has been revoked.")

    api_key_id = str(row.id)
    organization_id = str(row.organization_id)
    created_by = str(row.created_by)

    allowed, _remaining = api_key_rate_limiter.check_and_record(api_key_id)
    if not allowed:
        raise RateLimitExceededError()

    memberships = await _fetch_user_memberships(session_factory, created_by)
    membership = next((m for m in memberships if m["organization_id"] == organization_id), None)
    if membership is None:
        # The creating user is no longer a member of this organization
        # (removed, or the org itself is gone) — the key is effectively
        # dead even though nobody explicitly revoked it. See the
        # migration's docstring: this is intentional, not a bug.
        raise InvalidTokenError(
            "This API key's creator is no longer a member of the organization it was issued for."
        )

    await _touch_api_key_last_used(session_factory, api_key_id, organization_id, created_by)

    # Demo-plan organizations can't create API keys at all (see
    # app/api/v1/api_keys.py's plan gate) — this can only matter if an
    # organization was demoted to demo *after* a key already existed.
    # Checking anyway costs one cheap query and closes that edge case
    # completely, rather than leaving it as a documented assumption.
    await _check_demo_not_expired(session_factory, organization_id)

    return CurrentUser(
        user_id=created_by,
        organization_id=organization_id,
        role=membership["role"],
        email=None,
        auth_method="api_key",
        api_key_id=api_key_id,
    )


async def _touch_api_key_last_used(
    session_factory: async_sessionmaker[AsyncSession],
    api_key_id: str,
    organization_id: str,
    created_by: str,
) -> None:
    """
    Best-effort `last_used_at` update — same reliability posture as audit
    logging (app/services/audit_service.py): a failure here must never
    block or fail the actual request the key was authenticating.
    """
    claims_json = json.dumps({"sub": created_by, "organization_id": organization_id, "role": "authenticated"})
    try:
        async with session_factory() as session:
            async with session.begin():
                await session.execute(
                    text("SELECT set_config('request.jwt.claims', :claims, true)"),
                    {"claims": claims_json},
                )
                await session.execute(
                    text("UPDATE api_keys SET last_used_at = now() WHERE id = :id"),
                    {"id": api_key_id},
                )
    except Exception as exc:  # noqa: BLE001 - must never fail the request this key authenticated
        logger.error("Failed to update last_used_at for API key %s: %s", api_key_id, exc)


async def _fetch_user_memberships(
    session_factory: async_sessionmaker[AsyncSession], user_id: str
) -> list[dict]:
    """
    Look up every (organization_id, role) the given user belongs to.
    Scoped to just that user's own JWT claim (no organization claim yet —
    we don't know it yet, that's what this resolves) so the lookup itself
    goes through `user_roles`' own "see your own membership rows" RLS
    policy rather than bypassing RLS to do it.
    """
    claims_json = json.dumps({"sub": user_id, "role": "authenticated"})

    async with session_factory() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('request.jwt.claims', :claims, true)"),
                {"claims": claims_json},
            )
            result = await session.execute(
                text(
                    "SELECT organization_id::text AS organization_id, role "
                    "FROM user_roles WHERE user_id = :user_id ORDER BY created_at ASC"
                ),
                {"user_id": user_id},
            )
            return [dict(row._mapping) for row in result]


async def get_rls_session(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    session_factory: DbSessionFactoryDep,
) -> AsyncIterator[AsyncSession]:
    """
    Yield a database session where Postgres RLS is enforced as
    `current_user` — every query issued through this session is subject to
    the same tenant-isolation policies a direct Supabase client call would
    be. See this module's docstring for when to use this vs. the service
    role (short answer: use this).

    Usage in a route: `session: Annotated[AsyncSession, Depends(get_rls_session)]`.
    """
    claims_json = json.dumps(
        {
            "sub": current_user.user_id,
            "organization_id": current_user.organization_id,
            "role": "authenticated",
        }
    )

    async with session_factory() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config('request.jwt.claims', :claims, true)"),
                {"claims": claims_json},
            )
            yield session


def require_role(*allowed_roles: str):
    """
    Dependency factory for routes that need more than "any authenticated
    org member" — e.g. only owner/admin may invite teammates. Usage:

        @router.post(..., dependencies=[Depends(require_role("owner", "admin"))])
    """

    async def _check(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise InsufficientRoleError(
                f"This action requires one of {allowed_roles}; your role is '{current_user.role}'."
            )
        return current_user

    return _check


@dataclass(slots=True, frozen=True)
class AuthenticatedIdentity:
    """
    Just "who is this JWT for", with no organization resolved — used only
    by the one bootstrapping route that legitimately needs to authenticate
    a user who may have zero organizations yet (`POST /organizations`,
    which creates their first one). Every other route depends on
    `CurrentUser` instead, which requires organization membership to exist
    already — this narrower dependency should not be reached for from
    anywhere else.
    """

    user_id: str
    email: str | None


async def get_authenticated_identity(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedIdentity:
    """
    Verifies the caller's Supabase JWT without requiring organization
    membership — deliberately skips the step `get_current_user` cannot:
    a brand-new signup has no `user_roles` row yet, so resolving "which
    organization" would always fail for exactly the request whose entire
    purpose is to create the first one. API keys are rejected outright —
    an API key is always scoped to an already-existing organization by
    construction, so there's no legitimate reason one would ever call
    this route.
    """
    token = _extract_bearer_token(authorization)

    if looks_like_api_key(token):
        raise InvalidTokenError("API keys cannot be used to create organizations.")

    claims = _decode_supabase_jwt(token, settings)
    user_id = claims.get("sub")
    if not user_id:
        raise InvalidTokenError("Access token is missing a 'sub' claim.")

    return AuthenticatedIdentity(user_id=user_id, email=claims.get("email"))
