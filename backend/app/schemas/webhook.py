"""Request/response schemas for webhook management (app/api/v1/webhooks.py)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, HttpUrl


class CreateWebhookRequest(BaseModel):
    url: HttpUrl = Field(..., description="Must be HTTPS in production — HTTP is allowed only for local testing.")


class WebhookCreatedResponse(BaseModel):
    """
    Returned exactly once, at creation — `secret` is the only time it's
    ever shown. The receiving endpoint uses it to verify the
    `X-CanoryAI-Signature` header on every delivered payload.
    """

    id: uuid.UUID
    url: str
    secret: str
    enabled: bool
    created_at: datetime


class WebhookResponse(BaseModel):
    """A single row in the webhooks list — never includes the secret."""

    id: uuid.UUID
    url: str
    enabled: bool
    last_triggered_at: Optional[datetime]
    last_status_code: Optional[int]
    created_at: datetime
