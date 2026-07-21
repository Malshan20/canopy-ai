"""Request/response schemas for API key management (app/api/v1/api_keys.py)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="A human-readable label, e.g. 'ERP integration'.")


class ApiKeyCreatedResponse(BaseModel):
    """
    Returned exactly once, immediately after creation. `key` is the only
    time the plaintext credential is ever available — it is not
    recoverable afterward (only the hash is stored). The frontend must
    show this to the user with a clear "copy this now, you won't see it
    again" warning.
    """

    id: uuid.UUID
    name: str
    key: str
    key_prefix: str
    created_at: datetime


class ApiKeyResponse(BaseModel):
    """A single row in the API keys list — never includes the plaintext key."""

    id: uuid.UUID
    name: str
    key_prefix: str
    created_by: uuid.UUID
    last_used_at: Optional[datetime]
    revoked_at: Optional[datetime]
    created_at: datetime
