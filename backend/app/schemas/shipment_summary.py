"""
Response schemas for the shipments list, organization dashboard, and
compliance overview endpoints (Phase 8). All backed by real columns on
`shipments`/`audit_log` — see `app/models/shipment.py` for which fields
are best-effort (nullable) versus guaranteed.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ShipmentListItem(BaseModel):
    """A single row in the shipments list / data table."""

    id: uuid.UUID
    source_filename: Optional[str]
    commodity: Optional[str]
    country_of_production: Optional[str]
    declared_weight_kg: Optional[float]
    documents_processed: Optional[int]
    average_confidence: Optional[float]
    critical_farms: Optional[int]
    readiness: Optional[str]
    mass_balance_status: Optional[str]
    created_at: datetime


class ShipmentListResponse(BaseModel):
    """Response for GET /api/v1/shipments."""

    shipments: list[ShipmentListItem]
    total: int
    page: int
    page_size: int


class DashboardSummary(BaseModel):
    """
    Response for GET /api/v1/organizations/me/summary — the Dashboard
    page's summary cards. `active_suppliers` is intentionally absent: this
    platform doesn't persist a distinct supplier entity anywhere yet (farm
    names live inside per-document extraction data that isn't normalized
    into its own table — see `app/models/raw_document.py`), so returning a
    number for it would mean fabricating one. `average_confidence` and the
    farm-risk counts are `None` rather than `0` when no shipment has any
    data yet, so the frontend can distinguish "genuinely zero" from
    "nothing processed yet".
    """

    total_shipments: int
    documents_processed: int
    average_confidence: Optional[float]
    critical_risk_count: int
    compliance_ready_count: int
    needs_review_count: int
    blocked_count: int


class ComplianceOverview(BaseModel):
    """Response for GET /api/v1/organizations/me/compliance-overview."""

    shipments_requiring_review: int
    critical_alerts: int
    mass_balance_failures: int
    satellite_failures: int
    xml_generated_count: int
    total_shipments: int


class ProcessingJobResponse(BaseModel):
    """
    Response for the priority-queue upload path
    (`POST /shipments/upload-zip-async` and
    `GET /shipments/jobs/{job_id}`) — see app/models/processing_job.py.
    """

    id: uuid.UUID
    status: Literal["queued", "processing", "completed", "failed"]
    shipment_id: Optional[uuid.UUID]
    error_detail: Optional[str]
    queue_position: Optional[int] = None
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class ShipmentApprovalResponse(BaseModel):
    approved: bool
    approved_by_user_id: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None


class UpdateExportApprovalSettingRequest(BaseModel):
    require_export_approval: bool


class NotificationPreferencesResponse(BaseModel):
    email_on_shipment_completed: bool
    email_on_team_member_added: bool
    email_on_team_member_removed: bool
    email_on_plan_changed: bool


class MembershipResponse(BaseModel):
    """One organization the current user belongs to — the workspace switcher's data source."""

    organization_id: uuid.UUID
    name: str
    plan: str
    role: str


class OrganizationProfile(BaseModel):
    """Response for GET /api/v1/organizations/me."""

    id: uuid.UUID
    name: str
    plan: str
    shipments_used_this_year: int
    shipment_limit: Optional[int]
    created_at: datetime
    member_count: int
    sso_enabled: bool = False
    sso_domain: Optional[str] = None
    require_export_approval: bool = True
    # Only ever non-null when plan == "demo" — see
    # app/models/organization.py's demo_expires_at column docstring.
    demo_expires_at: Optional[datetime] = None


class UpdateOrganizationPlanRequest(BaseModel):
    """
    Request for PATCH /api/v1/organizations/me/plan.

    Interim, manual mechanism — there is no billing/payment integration
    yet. See app/services/plan_limits.py's module docstring for the full
    explanation and what should replace this before a real launch.
    """

    plan: Literal["growth", "enterprise", "custom", "demo"]


class TeamMember(BaseModel):
    """A single row in the Settings page's team member list."""

    user_id: uuid.UUID
    email: Optional[str]
    role: Literal["owner", "admin", "compliance_manager", "viewer"]
    joined_at: datetime


class InviteTeamMemberRequest(BaseModel):
    """
    Request for POST /api/v1/organizations/me/members.

    Adds an *existing* Supabase-authenticated user (looked up by email) to
    the caller's organization. This is not an email-invitation flow — no
    email is sent, because no email-sending service is integrated
    anywhere in this codebase (see the Settings page's "Notification
    Preferences" section for the same limitation elsewhere). If no
    account exists yet for the given email, the request fails with a
    clear message rather than silently doing nothing; the real fix is for
    that person to sign up first, then be added.
    """

    email: str = Field(..., min_length=3, max_length=255)
    role: Literal["owner", "admin", "compliance_manager", "viewer"] = "viewer"


class UpdateTeamMemberRoleRequest(BaseModel):
    role: Literal["owner", "admin", "compliance_manager", "viewer"]


class FlagDocumentRequest(BaseModel):
    """Request body for POST /shipments/{id}/documents/{id}/flag."""

    reason: Optional[str] = Field(default=None, max_length=2000)


class VerifySatelliteRequest(BaseModel):
    """Request body for POST /shipments/{id}/documents/{id}/verify-satellite."""

    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)


class GenerateDdsXmlRequest(BaseModel):
    """
    Request body for POST /shipments/{id}/xml.

    Deliberately a POST with a validated body rather than the GET +
    ~9 query parameters this used to be: the real DDS schema (see
    app/services/xml_generator.py's module docstring for how that was
    verified) requires substantially more fields than CanoryAI's
    Organization model stores anywhere, so they're supplied explicitly at
    export time, the same way operator_name/operator_eori/hs_code already
    were — just with proper Pydantic validation instead of a growing wall
    of Query(...) parameters.
    """

    operator_type: str = Field(default="OPERATOR", pattern="^(OPERATOR|TRADER)$")
    activity_type: str = Field(default="IMPORT", pattern="^(TRADE|IMPORT|EXPORT|DOMESTIC)$")
    country_of_activity: str = Field(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2 country code.")
    border_cross_country: str = Field(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2 country code.")

    operator_name: str = Field(..., min_length=1)
    operator_country: str = Field(..., min_length=2, max_length=2)
    operator_address: str = Field(..., min_length=1)
    operator_email: str = Field(..., min_length=3)
    operator_phone: str = Field(..., min_length=1)
    operator_eori: str | None = Field(default=None)

    hs_code: str = Field(..., min_length=1)
    commodity_description: str | None = Field(default=None)
    country_of_production: str | None = Field(default=None)
    geolocation_confidential: bool = Field(default=False)


class DocumentFlagResponse(BaseModel):
    """Current review-flag state for one document — the response for the
    flag/resolve/list-flags endpoints, and what the results table's Status
    column renders from."""

    shipment_id: uuid.UUID
    document_id: uuid.UUID
    is_flagged: bool
    reason: Optional[str] = None
    flagged_by_email: Optional[str] = None
    flagged_at: Optional[datetime] = None
    resolved_by_email: Optional[str] = None
    resolved_at: Optional[datetime] = None
