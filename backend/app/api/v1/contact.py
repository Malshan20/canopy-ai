"""
The public contact/support ticket system — see app/models/contact_ticket.py
for why this is deliberately NOT organization-scoped like the rest of the
API, and why access control here is application-level (ticket number +
the email a ticket was created with) rather than Postgres RLS.

Every route here is unauthenticated by design (a prospective customer
submitting the form has no CanoryAI account yet) and rate-limited by
client IP, since there's no API key or JWT to rate-limit against instead.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status
from sqlalchemy import text

from app.api.v1.dependencies import DbSessionFactoryDep, EmailServiceDep, SettingsDep
from app.core.exceptions import CustomsTreeError
from app.core.logging import get_logger
from app.schemas.contact import (
    ContactTicketDetailResponse,
    ContactTicketMessageResponse,
    CreateContactTicketRequest,
    CreateContactTicketResponse,
    ReplyToContactTicketRequest,
)
from app.services.rate_limiter import InMemoryRateLimiter

logger = get_logger(__name__)

router = APIRouter(prefix="/contact", tags=["Contact"])

# Deliberately much stricter than the API-key rate limiter (60/min) —
# this endpoint has no credential gate at all, so it's the only thing
# standing between the contact form and a spam bot. 5 submissions and 20
# lookups per minute per IP is generous for a real human, stingy for a
# script.
_create_ticket_limiter = InMemoryRateLimiter(requests_per_minute=5)
_lookup_ticket_limiter = InMemoryRateLimiter(requests_per_minute=20)


class TicketNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No ticket found with that number and email."


class TooManyRequestsError(CustomsTreeError):
    http_status = status.HTTP_429_TOO_MANY_REQUESTS
    default_message = "Too many requests. Please wait a moment and try again."


def _get_client_ip(request: Request) -> str:
    """
    Prefers X-Forwarded-For (set by Render's/most proxies' load balancer)
    over request.client.host, which would otherwise just be the proxy's
    own address for every request behind one. Falls back cleanly if
    neither is available (e.g. a direct connection in local dev).
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _notify_support(
    email_service: EmailServiceDep,
    settings: SettingsDep,
    *,
    ticket_number: str,
    subject: str,
    from_name: str,
    from_email: str,
    body: str,
) -> None:
    if not email_service.enabled:
        return
    html = f"<p><strong>Ticket {ticket_number}</strong> from {from_name} ({from_email})</p><p>{body}</p>"
    await email_service.send(
        to=settings.SUPPORT_NOTIFICATION_EMAIL, subject=f"[{ticket_number}] {subject}", html=html
    )


@router.post(
    "",
    response_model=CreateContactTicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit the contact form — creates a ticket and returns its ticket number.",
)
async def create_contact_ticket(
    body: CreateContactTicketRequest,
    request: Request,
    db_session_factory: DbSessionFactoryDep,
    email_service: EmailServiceDep,
    settings: SettingsDep,
) -> CreateContactTicketResponse:
    client_ip = _get_client_ip(request)
    allowed, _ = _create_ticket_limiter.check_and_record(client_ip)
    if not allowed:
        raise TooManyRequestsError()

    ticket_id = str(uuid.uuid4())
    async with db_session_factory() as session:
        async with session.begin():
            result = await session.execute(
                text(
                    "INSERT INTO contact_tickets (id, name, email, company, subject) "
                    "VALUES (:id, :name, :email, :company, :subject) "
                    "RETURNING ticket_number"
                ),
                {
                    "id": ticket_id,
                    "name": body.name,
                    "email": str(body.email),
                    "company": body.company,
                    "subject": body.subject,
                },
            )
            ticket_number = result.scalar_one()

            await session.execute(
                text(
                    "INSERT INTO contact_ticket_messages (id, ticket_id, sender_type, sender_name, body) "
                    "VALUES (:id, :ticket_id, 'customer', :sender_name, :body)"
                ),
                {"id": str(uuid.uuid4()), "ticket_id": ticket_id, "sender_name": body.name, "body": body.message},
            )

    logger.info("Contact ticket %s created by %s", ticket_number, body.email)

    await _notify_support(
        email_service,
        settings,
        ticket_number=ticket_number,
        subject=body.subject,
        from_name=body.name,
        from_email=str(body.email),
        body=body.message,
    )
    if email_service.enabled:
        await email_service.send(
            to=str(body.email),
            subject=f"We received your message — {ticket_number}",
            html=(
                f"<p>Hi {body.name},</p>"
                f"<p>Thanks for reaching out. Your ticket number is <strong>{ticket_number}</strong> — "
                f"you can track its status and reply anytime without needing an account.</p>"
                f"<p>We'll get back to you shortly.</p>"
            ),
        )

    return CreateContactTicketResponse(ticket_number=ticket_number)


@router.get(
    "/{ticket_number}",
    response_model=ContactTicketDetailResponse,
    responses={404: {"description": "Ticket not found, or the email doesn't match."}},
    summary="Track a ticket — requires the ticket number and the email it was created with.",
)
async def get_contact_ticket(
    ticket_number: str, email: str, request: Request, db_session_factory: DbSessionFactoryDep
) -> ContactTicketDetailResponse:
    client_ip = _get_client_ip(request)
    allowed, _ = _lookup_ticket_limiter.check_and_record(client_ip)
    if not allowed:
        raise TooManyRequestsError()

    async with db_session_factory() as session:
        ticket_result = await session.execute(
            text(
                "SELECT ticket_number, name, email, company, subject, status, created_at, updated_at "
                "FROM contact_tickets WHERE ticket_number = :ticket_number AND lower(email) = lower(:email)"
            ),
            {"ticket_number": ticket_number, "email": email},
        )
        ticket_row = ticket_result.first()
        if ticket_row is None:
            # Deliberately identical error whether the ticket doesn't
            # exist or the email just doesn't match it — distinguishing
            # the two would let someone probe for valid ticket numbers.
            raise TicketNotFoundError()

        messages_result = await session.execute(
            text(
                "SELECT id, sender_type, sender_name, body, created_at FROM contact_ticket_messages "
                "WHERE ticket_id = (SELECT id FROM contact_tickets WHERE ticket_number = :ticket_number) "
                "ORDER BY created_at ASC"
            ),
            {"ticket_number": ticket_number},
        )
        messages = [ContactTicketMessageResponse.model_validate(dict(row._mapping)) for row in messages_result]

    return ContactTicketDetailResponse(**dict(ticket_row._mapping), messages=messages)


@router.post(
    "/{ticket_number}/reply",
    response_model=ContactTicketDetailResponse,
    responses={404: {"description": "Ticket not found, or the email doesn't match."}},
    summary="Add a customer reply to a ticket.",
)
async def reply_to_contact_ticket(
    ticket_number: str,
    body: ReplyToContactTicketRequest,
    request: Request,
    db_session_factory: DbSessionFactoryDep,
    email_service: EmailServiceDep,
    settings: SettingsDep,
) -> ContactTicketDetailResponse:
    client_ip = _get_client_ip(request)
    allowed, _ = _lookup_ticket_limiter.check_and_record(client_ip)
    if not allowed:
        raise TooManyRequestsError()

    async with db_session_factory() as session:
        async with session.begin():
            ticket_result = await session.execute(
                text(
                    "SELECT id, name FROM contact_tickets WHERE ticket_number = :ticket_number AND lower(email) = lower(:email)"
                ),
                {"ticket_number": ticket_number, "email": str(body.email)},
            )
            ticket_row = ticket_result.first()
            if ticket_row is None:
                raise TicketNotFoundError()

            await session.execute(
                text(
                    "INSERT INTO contact_ticket_messages (id, ticket_id, sender_type, sender_name, body) "
                    "VALUES (:id, :ticket_id, 'customer', :sender_name, :body)"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "ticket_id": str(ticket_row.id),
                    "sender_name": ticket_row.name,
                    "body": body.message,
                },
            )
            # A customer replying to a resolved/closed ticket reopens
            # it — the same convention most support systems use, so
            # staff don't miss a reply sitting in an already-closed ticket.
            await session.execute(
                text(
                    "UPDATE contact_tickets SET status = 'open', updated_at = now() "
                    "WHERE id = :id AND status IN ('resolved', 'closed')"
                ),
                {"id": str(ticket_row.id)},
            )
            await session.execute(
                text("UPDATE contact_tickets SET updated_at = now() WHERE id = :id"), {"id": str(ticket_row.id)}
            )

    await _notify_support(
        email_service,
        settings,
        ticket_number=ticket_number,
        subject="New reply",
        from_name=ticket_row.name,
        from_email=str(body.email),
        body=body.message,
    )

    return await get_contact_ticket(ticket_number, str(body.email), request, db_session_factory)
