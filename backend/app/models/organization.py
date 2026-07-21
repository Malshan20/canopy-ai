"""
Organization (tenant) ORM model.

Every piece of tenant-owned data in CanoryAI — shipments, documents,
extracted supply-chain data, audit events — is scoped to exactly one
organization via an `organization_id` foreign key. This is the root of
that hierarchy.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# Kept as plain strings (not a Postgres ENUM), same reasoning as
# UserRole.VALID_ROLES — adding a plan tier later is a data change, not a
# schema migration. Enforced at the database level via CHECK constraint
# below, and at the application level via
# `app.services.plan_limits.PLAN_SHIPMENT_LIMITS` — keep both in sync.
VALID_PLANS = ("growth", "enterprise", "custom", "demo")


class Organization(Base):
    """A tenant company (e.g. a coffee importer, a cocoa trading company)."""

    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint(f"plan IN {VALID_PLANS}", name="ck_organizations_valid_plan"),
        {
            "comment": "Tenant/company records. Root of CanoryAI's multi-tenant data isolation.",
        },
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # No billing/payment system exists yet — see app/services/plan_limits.py's
    # module docstring for how this gets set today (an interim, manual
    # owner/admin action) versus how it should work once real billing lands.
    plan: Mapped[str] = mapped_column(String(20), nullable=False, server_default="growth")

    # --- Demo plan expiration ---
    # Set only when plan="demo" (see app/api/v1/organizations.py's
    # update_organization_plan) — a sales-provisioned trial, not a public
    # self-serve one, hard-locked 7 days after this timestamp. Enforced
    # in app/core/auth.py on every authenticated request, not merely
    # checked at login — a session that started before expiry doesn't
    # keep working past it. NULL for every non-demo organization, and
    # cleared back to NULL if a demo organization is later upgraded to a
    # real plan (so a stale expiry never lingers on a paying account).
    demo_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # --- SSO (Phase 11) ---
    # Configured exclusively by CanoryAI staff via the separate admin
    # panel project (see app/services/sso_service.py's module docstring
    # for the full reasoning and the honest caveat about what's actually
    # been verified here) — never self-service, since it requires
    # registering the customer's real SAML IdP with Supabase first.
    sso_enabled: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    # The email domain that triggers SSO routing at login, e.g.
    # "acmecorp.com" — NULL until configured. Unique: two organizations
    # can never claim the same domain, or login routing would be ambiguous.
    sso_domain: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    # Supabase's own internal UUID for the registered SAML IdP connection
    # (returned when it's created via their SSO Admin API) — this is
    # what's passed back to Supabase to actually initiate an SSO login.
    sso_provider_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Export approval gate (Phase 12) ---
    # When true (the default), a shipment's XML cannot be downloaded until
    # a compliance_manager/admin/owner has explicitly approved it — see
    # ShipmentApproval and app/api/v1/shipments.py's download_shipment_xml.
    # Owners/admins can turn this off once they've built real-world
    # confidence in the automated checks; it defaults ON deliberately,
    # since starting conservative and relaxing later is a much safer
    # default than the reverse.
    require_export_approval: Mapped[bool] = mapped_column(nullable=False, server_default="true")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"Organization(id={self.id!r}, name={self.name!r}, plan={self.plan!r})"
