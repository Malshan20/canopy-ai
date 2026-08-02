from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

TicketStatus = Literal["open", "in_progress", "resolved", "closed"]


class CreateContactTicketRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    company: Optional[str] = Field(default=None, max_length=255)
    subject: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1, max_length=10_000)


class CreateContactTicketResponse(BaseModel):
    ticket_number: str


class ContactTicketMessageResponse(BaseModel):
    id: uuid.UUID
    sender_type: Literal["customer", "admin"]
    sender_name: str
    body: str
    created_at: datetime


class ContactTicketDetailResponse(BaseModel):
    ticket_number: str
    name: str
    email: str
    company: Optional[str]
    subject: str
    status: TicketStatus
    created_at: datetime
    updated_at: datetime
    messages: list[ContactTicketMessageResponse]


class ReplyToContactTicketRequest(BaseModel):
    email: EmailStr
    message: str = Field(..., min_length=1, max_length=10_000)
