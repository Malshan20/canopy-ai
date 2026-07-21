from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import text

from app.api.v1.dependencies import RlsSessionDep
from app.core.exceptions import CustomsTreeError
from app.schemas.notification import NotificationListResponse, NotificationResponse
from app.schemas.responses import ErrorResponse

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No notification found with this ID."


@router.get(
    "",
    response_model=NotificationListResponse,
    responses={401: {"model": ErrorResponse}},
    summary="List notifications visible to the caller (their own + whole-organization ones), newest first.",
)
async def list_notifications(rls_session: RlsSessionDep) -> NotificationListResponse:
    result = await rls_session.execute(
        text(
            "SELECT id, type, title, body, link, read_at, created_at FROM notifications "
            "ORDER BY created_at DESC LIMIT 50"
        )
    )
    rows = result.all()

    count_result = await rls_session.execute(
        text("SELECT count(*) FROM notifications WHERE read_at IS NULL")
    )
    unread_count = count_result.scalar_one()

    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(dict(row._mapping)) for row in rows],
        unread_count=unread_count,
    )


@router.patch(
    "/{notification_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Mark one notification as read.",
)
async def mark_notification_read(notification_id: str, rls_session: RlsSessionDep) -> None:
    result = await rls_session.execute(
        text("UPDATE notifications SET read_at = now() WHERE id = :id AND read_at IS NULL RETURNING id"),
        {"id": notification_id},
    )
    if result.first() is None:
        # Either it doesn't exist, isn't visible to this caller (RLS), or
        # was already read — all three are fine to treat identically here,
        # since "already read" isn't really an error from the caller's
        # perspective. Only genuinely raise if we can confirm it never
        # existed for them at all.
        exists = await rls_session.execute(
            text("SELECT id FROM notifications WHERE id = :id"), {"id": notification_id}
        )
        if exists.first() is None:
            raise NotificationNotFoundError()


@router.post(
    "/mark-all-read",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={401: {"model": ErrorResponse}},
    summary="Mark every notification visible to the caller as read.",
)
async def mark_all_notifications_read(rls_session: RlsSessionDep) -> None:
    await rls_session.execute(text("UPDATE notifications SET read_at = now() WHERE read_at IS NULL"))
