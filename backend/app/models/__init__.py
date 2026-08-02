"""
Importing this package registers every ORM model on `Base.metadata`.

This matters beyond migrations: SQLAlchemy only knows how to resolve a
`ForeignKey("organizations.id")`-style reference at runtime if the
`Organization` class (or an equivalent plain `Table`) has actually been
imported somewhere in the running process — not just referenced by name.
`main.py` imports this package directly (see below) so every model here is
guaranteed registered before the app starts serving requests, not just
when Alembic runs.
"""

from __future__ import annotations

from app.models.api_key import ApiKey
from app.models.audit_log import AuditLog
from app.models.external import auth_users_table
from app.models.contact_ticket import ContactTicket, ContactTicketMessage
from app.models.notification import Notification
from app.models.notification_preference import NotificationPreference
from app.models.organization import Organization
from app.models.shipment_approval import ShipmentApproval
from app.models.processing_job import ProcessingJob
from app.models.raw_document import ExtractedSupplyChain, RawDocument
from app.models.shipment import Shipment
from app.models.user_role import UserRole
from app.models.webhook import Webhook

__all__ = [
    "ApiKey",
    "AuditLog",
    "auth_users_table",
    "ContactTicket",
    "ContactTicketMessage",
    "Notification",
    "NotificationPreference",
    "Organization",
    "ShipmentApproval",
    "ProcessingJob",
    "RawDocument",
    "ExtractedSupplyChain",
    "Shipment",
    "UserRole",
    "Webhook",
]
