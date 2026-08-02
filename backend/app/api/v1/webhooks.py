"""
Webhook management routes — create, list, delete.

This is CanoryAI's honest, buildable answer to "ERP integrations" (see
app/models/webhook.py's docstring for the full reasoning): a signed HTTP
notification when a shipment finishes, not a named connector to any
specific vendor system.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select, text

from app.api.v1.dependencies import CurrentUserDep, RlsSessionDep
from app.core.exceptions import CustomsTreeError, InsufficientRoleError, PlanRestrictedError
from app.core.logging import get_logger
from app.models.webhook import Webhook, generate_webhook_secret
from app.schemas.responses import ErrorResponse
from app.schemas.webhook import CreateWebhookRequest, WebhookCreatedResponse, WebhookResponse
from app.services.plan_limits import plan_has_api_access

logger = get_logger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


class WebhookNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No webhook found with this ID in your organization."


@router.post(
    "",
    response_model=WebhookCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners and admins can create webhooks."},
    },
    summary="Register a webhook. The signing secret is returned exactly once.",
)
async def create_webhook(
    body: CreateWebhookRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
) -> WebhookCreatedResponse:
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can create webhooks.")

    # Webhooks are listed under Enterprise on the pricing page ("Webhooks
    # for custom integrations") — same gap and same fix as API keys (see
    # app/api/v1/api_keys.py): previously nothing checked this, so any
    # Growth organization could register webhooks exactly like Enterprise.
    plan_result = await rls_session.execute(
        text("SELECT plan FROM organizations WHERE id = :id"), {"id": current_user.organization_id}
    )
    plan_row = plan_result.first()
    plan = plan_row.plan if plan_row is not None else "growth"
    if not plan_has_api_access(plan):
        raise PlanRestrictedError(
            f"Webhooks are not included in your organization's '{plan}' plan. "
            "Upgrade to Enterprise or contact sales to enable them."
        )

    new_webhook = Webhook(
        organization_id=current_user.organization_id,
        created_by=current_user.user_id,
        url=str(body.url),
        secret=generate_webhook_secret(),
    )
    rls_session.add(new_webhook)
    await rls_session.flush()

    logger.info("Webhook created: id=%s org=%s url=%s", new_webhook.id, current_user.organization_id, body.url)

    return WebhookCreatedResponse(
        id=new_webhook.id,
        url=new_webhook.url,
        secret=new_webhook.secret,
        enabled=new_webhook.enabled,
        created_at=new_webhook.created_at,
    )


@router.get(
    "",
    response_model=list[WebhookResponse],
    responses={401: {"model": ErrorResponse}},
    summary="List webhooks for the caller's organization (never includes the signing secret).",
)
async def list_webhooks(rls_session: RlsSessionDep) -> list[WebhookResponse]:
    result = await rls_session.execute(select(Webhook).order_by(Webhook.created_at.desc()))
    webhooks = result.scalars().all()
    return [WebhookResponse.model_validate(webhook, from_attributes=True) for webhook in webhooks]


@router.delete(
    "/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners and admins can delete webhooks."},
        404: {"model": ErrorResponse},
    },
    summary="Delete a webhook.",
)
async def delete_webhook(
    webhook_id: str,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
) -> None:
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can delete webhooks.")

    result = await rls_session.execute(
        text("DELETE FROM webhooks WHERE id = :id RETURNING id"), {"id": webhook_id}
    )
    if result.first() is None:
        raise WebhookNotFoundError()

    logger.info("Webhook deleted: id=%s org=%s", webhook_id, current_user.organization_id)
