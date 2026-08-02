"""
API key management routes — create, list, revoke.

Every route here is gated to interactive (JWT-authenticated) sessions
only: an API key can never be used to create or revoke *other* API keys,
even for an owner/admin-equivalent key. This is a deliberate containment
boundary — a compromised key can do damage within its own scope, but
can't mint itself replacements or lock out the humans who could otherwise
revoke it.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select, text

from app.api.v1.dependencies import CurrentUserDep, RlsSessionDep
from app.core.auth import CurrentUser
from app.core.exceptions import CustomsTreeError, InsufficientRoleError, PlanRestrictedError
from app.core.logging import get_logger
from app.models.api_key import ApiKey
from app.schemas.api_key import ApiKeyCreatedResponse, ApiKeyResponse, CreateApiKeyRequest
from app.schemas.responses import ErrorResponse
from app.services.api_key_service import display_prefix, generate_api_key, hash_api_key
from app.services.plan_limits import plan_has_api_access

logger = get_logger(__name__)

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


class ApiKeyNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No API key found with this ID in your organization."


def _require_interactive_session(current_user: CurrentUser) -> None:
    if current_user.auth_method == "api_key":
        raise InsufficientRoleError("API keys cannot be used to create or revoke other API keys.")


@router.post(
    "",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Requires owner/admin role and an interactive session."},
    },
    summary="Create a new API key. The plaintext key is returned exactly once.",
)
async def create_api_key(
    body: CreateApiKeyRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
) -> ApiKeyCreatedResponse:
    _require_interactive_session(current_user)
    # RLS's own INSERT policy (api_keys_insert_owner_admin) independently
    # enforces owner/admin too — this check exists to fail with a clear
    # 403 message rather than a generic RLS-violation database error.
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can create API keys.")

    # "API access" is an Enterprise-tier feature (frontend/components/
    # landing/pricing.tsx lists it under Enterprise, explicitly not
    # Growth) — previously advertised-only, since nothing here actually
    # checked it. Any Growth organization could create and use API keys
    # exactly like an Enterprise one.
    plan_result = await rls_session.execute(
        text("SELECT plan FROM organizations WHERE id = :id"), {"id": current_user.organization_id}
    )
    plan_row = plan_result.first()
    plan = plan_row.plan if plan_row is not None else "growth"
    if not plan_has_api_access(plan):
        raise PlanRestrictedError(
            f"API access is not included in your organization's '{plan}' plan. "
            "Upgrade to Enterprise or contact sales to enable it."
        )

    plaintext_key = generate_api_key()

    new_key = ApiKey(
        organization_id=current_user.organization_id,
        created_by=current_user.user_id,
        name=body.name,
        key_prefix=display_prefix(plaintext_key),
        key_hash=hash_api_key(plaintext_key),
    )
    rls_session.add(new_key)
    await rls_session.flush()

    logger.info(
        "API key created: id=%s org=%s created_by=%s name=%r",
        new_key.id,
        current_user.organization_id,
        current_user.user_id,
        body.name,
    )

    return ApiKeyCreatedResponse(
        id=new_key.id,
        name=new_key.name,
        key=plaintext_key,
        key_prefix=new_key.key_prefix,
        created_at=new_key.created_at,
    )


@router.get(
    "",
    response_model=list[ApiKeyResponse],
    responses={401: {"model": ErrorResponse}},
    summary="List API keys for the caller's organization (never includes the plaintext key).",
)
async def list_api_keys(rls_session: RlsSessionDep) -> list[ApiKeyResponse]:
    result = await rls_session.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = result.scalars().all()
    return [ApiKeyResponse.model_validate(key, from_attributes=True) for key in keys]


@router.delete(
    "/{api_key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Requires owner/admin role and an interactive session."},
        404: {"model": ErrorResponse},
    },
    summary="Revoke an API key. Immediate and irreversible — the key stops working on its very next request.",
)
async def revoke_api_key(
    api_key_id: str,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
) -> None:
    _require_interactive_session(current_user)
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can revoke API keys.")

    result = await rls_session.execute(
        text("UPDATE api_keys SET revoked_at = now() WHERE id = :id AND revoked_at IS NULL RETURNING id"),
        {"id": api_key_id},
    )
    if result.first() is None:
        raise ApiKeyNotFoundError()

    logger.info("API key revoked: id=%s org=%s by=%s", api_key_id, current_user.organization_id, current_user.user_id)
