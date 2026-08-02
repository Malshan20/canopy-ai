"""
Organization-level API routes: profile, team members, the Dashboard
page's summary cards, and the Compliance page's overview. Every route is
scoped to the caller's own organization via `rls_session` — there is no
"list all organizations" or "look up another organization" route by
design, since nothing in this application legitimately needs to cross
that boundary from an authenticated user's session.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

from app.api.v1.dependencies import (
    AuthenticatedIdentityDep,
    CurrentUserDep,
    DbSessionFactoryDep,
    HttpClientDep,
    NotificationServiceDep,
    RlsSessionDep,
    SettingsDep,
    SupabaseAdminServiceDep,
)
from app.core.config import get_settings
from app.core.exceptions import CustomsTreeError, InsufficientRoleError, QuotaExceededError
from app.core.logging import get_logger
from app.models.audit_log import AuditLog
from app.models.organization import Organization
from app.models.shipment import Shipment
from app.models.user_role import UserRole
from app.schemas.responses import ErrorResponse
from app.schemas.shipment_summary import (
    ComplianceOverview,
    DashboardSummary,
    InviteTeamMemberRequest,
    MembershipResponse,
    NotificationPreferencesResponse,
    OrganizationProfile,
    TeamMember,
    UpdateExportApprovalSettingRequest,
    UpdateOrganizationPlanRequest,
    UpdateTeamMemberRoleRequest,
)
from app.services.plan_limits import current_billing_year_start, get_shipment_limit, get_team_member_limit
from app.services.traces_soap_client import echo_traces

logger = get_logger(__name__)

router = APIRouter(prefix="/organizations", tags=["Organizations"])


# NOTE: there is deliberately no `POST /organizations` route.
#
# This used to be the self-serve signup bootstrap step: any freshly
# self-registered Supabase account (zero invitation, zero approval) could
# call it once and become the owner of a brand-new organization. That's
# fundamentally the wrong model for an invite-only enterprise product —
# workspaces are provisioned internally (via the separate admin panel,
# which calls `create_organization_with_owner()` directly through its own
# service-role Supabase connection) and new members join an *existing*
# organization through a real invitation (see `POST /me/members` below
# and `app/invite/` on the frontend), never by creating their own.
#
# The underlying SQL function, `create_organization_with_owner()`, still
# exists and is still used — by the admin panel, not by this public API.
# Removing this route (rather than merely hiding the frontend button that
# called it) is the actual fix: a frontend change alone wouldn't have
# stopped anyone with a self-registered Supabase account from calling
# this endpoint directly.


@router.get(
    "/me/memberships",
    response_model=list[MembershipResponse],
    responses={401: {"model": ErrorResponse}},
    summary="List every organization the caller belongs to — powers the workspace switcher.",
)
async def list_my_organizations(identity: AuthenticatedIdentityDep, session_factory: DbSessionFactoryDep) -> list[MembershipResponse]:
    """
    Deliberately uses `AuthenticatedIdentityDep`, not `CurrentUserDep` —
    this needs to work even for the fresh-signup case (no organization
    yet at all, which just returns an empty list), and it needs to see
    *every* membership at once, not the single organization
    `CurrentUserDep` resolves for RLS-scoping a single request. Backed
    by `list_my_organizations()`, a SECURITY DEFINER function — see that
    migration for why a normal RLS-scoped session structurally can't
    answer this on its own (RLS on `organizations` only ever exposes the
    one org currently selected in the caller's JWT claims).
    """
    async with session_factory() as session:
        result = await session.execute(
            text("SELECT * FROM list_my_organizations(:user_id)"), {"user_id": identity.user_id}
        )
        rows = result.all()

    return [MembershipResponse.model_validate(dict(row._mapping)) for row in rows]


_PREFERENCE_COLUMNS = (
    "email_on_shipment_completed",
    "email_on_team_member_added",
    "email_on_team_member_removed",
    "email_on_plan_changed",
)


@router.get(
    "/me/notification-preferences",
    response_model=NotificationPreferencesResponse,
    responses={401: {"model": ErrorResponse}},
    summary="Get the organization's notification email preferences.",
)
async def get_notification_preferences(rls_session: RlsSessionDep) -> NotificationPreferencesResponse:
    """
    Every event type always creates an in-app notification (see
    app/services/notification_service.py) — these preferences only
    control whether it ALSO sends an email. A brand-new organization has
    no row here yet, which means "use the defaults" (shipment-completed
    emails on, everything else off) rather than an error — this matches
    that same default rather than surfacing an empty state the frontend
    would need special-casing for.
    """
    result = await rls_session.execute(
        text(f"SELECT {', '.join(_PREFERENCE_COLUMNS)} FROM notification_preferences LIMIT 1")
    )
    row = result.first()
    if row is None:
        return NotificationPreferencesResponse(
            email_on_shipment_completed=True,
            email_on_team_member_added=False,
            email_on_team_member_removed=False,
            email_on_plan_changed=False,
        )
    return NotificationPreferencesResponse.model_validate(dict(row._mapping))


@router.patch(
    "/me/notification-preferences",
    response_model=NotificationPreferencesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse, "description": "Owner/admin only."}},
    summary="Update the organization's notification email preferences.",
)
async def update_notification_preferences(
    body: NotificationPreferencesResponse, current_user: CurrentUserDep, rls_session: RlsSessionDep
) -> NotificationPreferencesResponse:
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can change notification preferences.")

    await rls_session.execute(
        text(
            "INSERT INTO notification_preferences "
            "(id, organization_id, email_on_shipment_completed, email_on_team_member_added, "
            " email_on_team_member_removed, email_on_plan_changed) "
            "VALUES (gen_random_uuid(), :organization_id, :shipment_completed, :team_member_added, "
            " :team_member_removed, :plan_changed) "
            "ON CONFLICT (organization_id) DO UPDATE SET "
            "email_on_shipment_completed = EXCLUDED.email_on_shipment_completed, "
            "email_on_team_member_added = EXCLUDED.email_on_team_member_added, "
            "email_on_team_member_removed = EXCLUDED.email_on_team_member_removed, "
            "email_on_plan_changed = EXCLUDED.email_on_plan_changed, "
            "updated_at = now()"
        ),
        {
            "organization_id": current_user.organization_id,
            "shipment_completed": body.email_on_shipment_completed,
            "team_member_added": body.email_on_team_member_added,
            "team_member_removed": body.email_on_team_member_removed,
            "plan_changed": body.email_on_plan_changed,
        },
    )
    logger.info("Organization %s notification preferences updated by %s", current_user.organization_id, current_user.user_id)
    return body


class OrganizationNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "Organization not found."


class MemberNotFoundError(CustomsTreeError):
    http_status = status.HTTP_404_NOT_FOUND
    default_message = "No account found for that email. They need to sign up first before you can add them."


class AlreadyMemberError(CustomsTreeError):
    http_status = status.HTTP_409_CONFLICT
    default_message = "This person is already a member of your organization."


@router.get(
    "/me",
    response_model=OrganizationProfile,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="The caller's organization profile.",
)
async def get_my_organization(
    current_user: CurrentUserDep, rls_session: RlsSessionDep
) -> OrganizationProfile:
    org_result = await rls_session.execute(
        select(Organization).where(Organization.id == current_user.organization_id)
    )
    organization = org_result.scalar_one_or_none()
    if organization is None:
        # RLS means this can only happen if the org genuinely doesn't
        # exist, or (defensively) the membership row referenced a
        # deleted organization — either way, nothing to show.
        raise OrganizationNotFoundError()

    count_result = await rls_session.execute(select(func.count()).select_from(UserRole))
    member_count = count_result.scalar_one()

    usage_result = await rls_session.execute(
        select(func.count())
        .select_from(Shipment)
        .where(Shipment.created_at >= current_billing_year_start())
    )
    shipments_used_this_year = usage_result.scalar_one()

    return OrganizationProfile(
        id=organization.id,
        name=organization.name,
        plan=organization.plan,
        shipments_used_this_year=shipments_used_this_year,
        shipment_limit=get_shipment_limit(organization.plan),
        created_at=organization.created_at,
        member_count=member_count,
        sso_enabled=organization.sso_enabled,
        sso_domain=organization.sso_domain,
        require_export_approval=organization.require_export_approval,
        demo_expires_at=organization.demo_expires_at,
    )


@router.patch(
    "/me/plan",
    response_model=OrganizationProfile,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners and admins can change the organization's plan."},
        404: {"model": ErrorResponse},
    },
    summary="Change the organization's plan (interim manual mechanism — see this route's docstring).",
)
async def update_organization_plan(
    body: UpdateOrganizationPlanRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    notification_service: NotificationServiceDep,
) -> OrganizationProfile:
    """
    **There is no billing/payment system integrated yet.** This route is
    an interim, manual substitute — see `app/services/plan_limits.py`'s
    module docstring for the full explanation of what should replace it
    before real customers are actually charged money. Owner/admin only.
    """
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can change the organization's plan.")

    # A single atomic UPDATE, not "set plan" then a separate "set expiry"
    # write — avoids any window where the two could disagree. Switching
    # TO demo starts a real 7-day clock from this exact moment (enforced
    # on every request afterward — see app/core/auth.py's
    # _check_demo_not_expired, not just checked here at assignment time).
    # Switching AWAY from demo — upgrading a trial to a real plan —
    # clears demo_expires_at back to NULL, so a stale expiry can never
    # linger on and accidentally lock out a paying account later.
    result = await rls_session.execute(
        text(
            "UPDATE organizations "
            "SET plan = :plan, "
            "    demo_expires_at = CASE WHEN :plan = 'demo' THEN now() + interval '7 days' ELSE NULL END "
            "WHERE id = :id "
            "RETURNING id, demo_expires_at"
        ),
        {"plan": body.plan, "id": current_user.organization_id},
    )
    updated_row = result.first()
    if updated_row is None:
        raise OrganizationNotFoundError()

    logger.info(
        "Organization %s plan changed to '%s' by user %s%s",
        current_user.organization_id,
        body.plan,
        current_user.user_id,
        f" (demo expires {updated_row.demo_expires_at.isoformat()})" if body.plan == "demo" else "",
    )

    notification_body = (
        f"Your organization's plan changed to Demo — full access for 7 days, until "
        f"{updated_row.demo_expires_at.strftime('%B %-d, %Y')}."
        if body.plan == "demo"
        else f"Your organization's plan changed to {body.plan.capitalize()}."
    )
    await notification_service.notify(
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        notif_type="plan_changed",
        title="Plan updated",
        body=notification_body,
        link="/settings",
    )

    return await get_my_organization(current_user, rls_session)


@router.patch(
    "/me/export-approval-setting",
    response_model=OrganizationProfile,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse, "description": "Owner/admin only."}},
    summary="Turn the mandatory export sign-off requirement on or off for this organization.",
)
async def update_export_approval_setting(
    body: UpdateExportApprovalSettingRequest, current_user: CurrentUserDep, rls_session: RlsSessionDep
) -> OrganizationProfile:
    """
    Defaults ON for every organization (see the Organization model) —
    this route is how an owner/admin turns it off once they've built
    real-world confidence in the automated checks. Turning it back on
    doesn't retroactively un-approve anything already approved; it only
    affects shipments exported from that point forward.
    """
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can change the export approval requirement.")

    result = await rls_session.execute(
        text("UPDATE organizations SET require_export_approval = :value WHERE id = :id RETURNING id"),
        {"value": body.require_export_approval, "id": current_user.organization_id},
    )
    if result.first() is None:
        raise OrganizationNotFoundError()

    logger.info(
        "Organization %s require_export_approval set to %s by %s",
        current_user.organization_id,
        body.require_export_approval,
        current_user.user_id,
    )
    return await get_my_organization(current_user, rls_session)


@router.get(
    "/me/members",
    response_model=list[TeamMember],
    responses={401: {"model": ErrorResponse}},
    summary="Team members in the caller's organization.",
)
async def list_team_members(rls_session: RlsSessionDep) -> list[TeamMember]:
    """
    Joins `user_roles` against `auth.users` for display email addresses —
    `canopyai_app` holds `SELECT` on `auth.users` specifically for this
    (see `scripts/local_dev_auth_stub.sql` / the Phase 6 migration notes),
    since Supabase Auth owns that table and this app never writes to it.
    """
    query = text(
        """
        SELECT ur.user_id, u.email, ur.role, ur.created_at AS joined_at
        FROM user_roles ur
        LEFT JOIN auth.users u ON u.id = ur.user_id
        ORDER BY ur.created_at ASC
        """
    )
    result = await rls_session.execute(query)
    return [TeamMember.model_validate(dict(row._mapping)) for row in result]


@router.post(
    "/me/members",
    response_model=TeamMember,
    status_code=status.HTTP_201_CREATED,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners and admins can add team members."},
        404: {"model": ErrorResponse, "description": "No account exists and email invites aren't configured."},
        409: {"model": ErrorResponse, "description": "Already a member of this organization."},
    },
    summary="Add a team member by email — invites them if they don't have an account yet.",
)
async def invite_team_member(
    body: InviteTeamMemberRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    supabase_admin: SupabaseAdminServiceDep,
    notification_service: NotificationServiceDep,
) -> TeamMember:
    """
    Two paths, both ending at the same `user_roles` insert:
      - The email already has a CanoryAI account -> add them directly.
      - It doesn't -> create the account and send a real invite email via
        Supabase's own built-in email service (see
        app/services/supabase_admin_service.py), the same mechanism the
        separate admin panel project uses for onboarding a brand-new
        customer, reused here for the "invite a teammate" case within an
        existing organization. Requires `SUPABASE_SERVICE_ROLE_KEY` to be
        configured — if it isn't, this falls back to the previous
        behavior (404, ask them to sign up first) rather than silently
        pretending to have sent an email it didn't.
    """
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can add team members.")

    # Team seats are a real, advertised plan limit (pricing.tsx: Growth
    # "Up to 5", Enterprise "Up to 25", Custom "Unlimited") — previously
    # unenforced: member_count was computed and displayed on the org
    # profile, but nothing stopped inviting past it on any plan.
    plan_result = await rls_session.execute(
        text("SELECT plan FROM organizations WHERE id = :id"), {"id": current_user.organization_id}
    )
    plan_row = plan_result.first()
    plan = plan_row.plan if plan_row is not None else "growth"
    seat_limit = get_team_member_limit(plan)
    if seat_limit is not None:
        count_result = await rls_session.execute(
            text("SELECT count(*) FROM user_roles WHERE organization_id = :org_id"),
            {"org_id": current_user.organization_id},
        )
        current_member_count = count_result.scalar_one()
        if current_member_count >= seat_limit:
            raise QuotaExceededError(
                f"Your organization's '{plan}' plan allows {seat_limit} team members, and you "
                f"already have {current_member_count}. Upgrade your plan or contact sales to add more."
            )

    user_result = await rls_session.execute(
        text("SELECT id, email FROM auth.users WHERE email = :email"), {"email": body.email}
    )
    user_row = user_result.first()

    if user_row is None:
        settings = get_settings()
        frontend_origin = settings.frontend_origins[0] if settings.frontend_origins else None
        new_user_id = (
            await supabase_admin.invite_user_by_email(body.email, redirect_to=f"{frontend_origin}/invite/callback")
            if frontend_origin and supabase_admin.enabled
            else None
        )
        if new_user_id is None:
            raise MemberNotFoundError()
        user_email = body.email
        user_id = new_user_id
    else:
        user_email = user_row.email
        user_id = str(user_row.id)

    try:
        insert_result = await rls_session.execute(
            text(
                "INSERT INTO user_roles (id, user_id, organization_id, role) "
                "VALUES (gen_random_uuid(), :user_id, :organization_id, :role) "
                "RETURNING user_id, role, created_at AS joined_at"
            ),
            {
                "user_id": user_id,
                "organization_id": current_user.organization_id,
                "role": body.role,
            },
        )
    except IntegrityError as exc:
        raise AlreadyMemberError() from exc

    new_member = insert_result.first()
    logger.info(
        "User %s added %s to organization %s with role '%s'",
        current_user.user_id,
        user_email,
        current_user.organization_id,
        body.role,
    )

    await notification_service.notify(
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        notif_type="team_member_added",
        title="New team member added",
        body=f"{user_email} was added to your organization as {body.role}.",
        link="/settings",
    )

    return TeamMember(
        user_id=new_member.user_id,
        email=user_email,
        role=new_member.role,
        joined_at=new_member.joined_at,
    )


@router.patch(
    "/me/members/{member_user_id}",
    response_model=TeamMember,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners and admins can change roles."},
        404: {"model": ErrorResponse},
    },
    summary="Change a team member's role.",
)
async def update_team_member_role(
    member_user_id: str,
    body: UpdateTeamMemberRoleRequest,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
) -> TeamMember:
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can change a team member's role.")

    result = await rls_session.execute(
        text(
            "UPDATE user_roles SET role = :role "
            "WHERE user_id = :user_id AND organization_id = :organization_id "
            "RETURNING user_id, organization_id, role, created_at AS joined_at"
        ),
        {"role": body.role, "user_id": member_user_id, "organization_id": current_user.organization_id},
    )
    updated = result.first()
    if updated is None:
        raise MemberNotFoundError("No such member in your organization.")

    email_result = await rls_session.execute(
        text("SELECT email FROM auth.users WHERE id = :id"), {"id": member_user_id}
    )
    email_row = email_result.first()

    return TeamMember(
        user_id=updated.user_id,
        email=email_row.email if email_row else None,
        role=updated.role,
        joined_at=updated.joined_at,
    )


@router.delete(
    "/me/members/{member_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse, "description": "Only owners and admins can remove team members."},
        404: {"model": ErrorResponse},
    },
    summary="Remove a team member from the organization.",
)
async def remove_team_member(
    member_user_id: str,
    current_user: CurrentUserDep,
    rls_session: RlsSessionDep,
    notification_service: NotificationServiceDep,
) -> None:
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can remove team members.")
    if member_user_id == current_user.user_id:
        raise InsufficientRoleError(
            "You can't remove yourself. Have another owner/admin remove you, or transfer ownership first."
        )

    email_result = await rls_session.execute(
        text("SELECT email FROM auth.users WHERE id = :id"), {"id": member_user_id}
    )
    email_row = email_result.first()

    result = await rls_session.execute(
        text("DELETE FROM user_roles WHERE user_id = :user_id AND organization_id = :organization_id RETURNING user_id"),
        {"user_id": member_user_id, "organization_id": current_user.organization_id},
    )
    if result.first() is None:
        raise MemberNotFoundError("No such member in your organization.")

    logger.info("User %s removed member %s from organization %s", current_user.user_id, member_user_id, current_user.organization_id)

    await notification_service.notify(
        organization_id=current_user.organization_id,
        acting_user_id=current_user.user_id,
        notif_type="team_member_removed",
        title="Team member removed",
        body=f"{email_row.email if email_row else 'A team member'} was removed from your organization.",
        link="/settings",
    )


@router.get(
    "/me/summary",
    response_model=DashboardSummary,
    responses={401: {"model": ErrorResponse}},
    summary="Dashboard page summary cards for the caller's organization.",
)
async def get_dashboard_summary(rls_session: RlsSessionDep) -> DashboardSummary:
    result = await rls_session.execute(
        select(
            func.count().label("total_shipments"),
            func.coalesce(func.sum(Shipment.documents_processed), 0).label("documents_processed"),
            func.avg(Shipment.average_confidence).label("average_confidence"),
            func.count().filter(Shipment.critical_farms > 0).label("critical_risk_count"),
            func.count().filter(Shipment.readiness == "ready").label("compliance_ready_count"),
            func.count().filter(Shipment.readiness == "needs_review").label("needs_review_count"),
            func.count().filter(Shipment.readiness == "blocked").label("blocked_count"),
        ).select_from(Shipment)
    )
    row = result.one()

    return DashboardSummary(
        total_shipments=row.total_shipments,
        documents_processed=int(row.documents_processed),
        average_confidence=float(row.average_confidence) if row.average_confidence is not None else None,
        critical_risk_count=row.critical_risk_count,
        compliance_ready_count=row.compliance_ready_count,
        needs_review_count=row.needs_review_count,
        blocked_count=row.blocked_count,
    )


@router.get(
    "/me/compliance-overview",
    response_model=ComplianceOverview,
    responses={401: {"model": ErrorResponse}},
    summary="Compliance page overview for the caller's organization.",
)
async def get_compliance_overview(rls_session: RlsSessionDep) -> ComplianceOverview:
    shipment_result = await rls_session.execute(
        select(
            func.count().label("total_shipments"),
            func.count().filter(Shipment.readiness == "needs_review").label("shipments_requiring_review"),
            func.count().filter(Shipment.critical_farms > 0).label("critical_alerts"),
            func.count()
            .filter(Shipment.mass_balance_status == "mass_balance_mismatch")
            .label("mass_balance_failures"),
        ).select_from(Shipment)
    )
    shipment_row = shipment_result.one()

    audit_result = await rls_session.execute(
        select(
            func.count().filter(AuditLog.action_type == "SATELLITE_CHECK_FAILED").label("satellite_failures"),
            func.count().filter(AuditLog.action_type == "XML_GENERATED").label("xml_generated_count"),
        ).select_from(AuditLog)
    )
    audit_row = audit_result.one()

    return ComplianceOverview(
        shipments_requiring_review=shipment_row.shipments_requiring_review,
        critical_alerts=shipment_row.critical_alerts,
        mass_balance_failures=shipment_row.mass_balance_failures,
        satellite_failures=audit_row.satellite_failures,
        xml_generated_count=audit_row.xml_generated_count,
        total_shipments=shipment_row.total_shipments,
    )


@router.post(
    "/me/traces-echo-test",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "TRACES NT responded — see this route's own docstring for what that does and doesn't confirm."},
        401: {"model": ErrorResponse, "description": "Missing or invalid access token."},
        403: {"model": ErrorResponse, "description": "Only owners and admins can run this test."},
        501: {"model": ErrorResponse, "description": "Real TRACES NT credentials are not configured."},
        502: {"model": ErrorResponse, "description": "TRACES NT rejected the connection (a real SOAP Fault)."},
    },
    summary="Test real TRACES NT connectivity and authentication — no shipment or submission involved.",
)
async def test_traces_connectivity(
    current_user: CurrentUserDep,
    settings: SettingsDep,
    http_client: HttpClientDep,
) -> dict:
    """
    A basic authenticated "ping" against TRACES NT's EudrEchoService —
    exactly the first real check the European Commission's own
    conformance-testing process recommends before ever attempting a real
    DDS submission (see app/services/traces_soap_client.py's echo_traces
    docstring). Deliberately involves no shipment and cannot submit
    anything — the only two things this can confirm are "your credentials
    are valid" and "this server's SOAP/WS-Security implementation is
    compatible with the live system." Run this once after configuring
    TRACES_USERNAME / TRACES_AUTHENTICATION_KEY, before ever calling
    POST /shipments/{id}/submit-to-traces for real.
    """
    if current_user.role not in ("owner", "admin"):
        raise InsufficientRoleError("Only owners and admins can test TRACES NT connectivity.")

    result = await echo_traces(settings, http_client)
    logger.info(
        "TRACES NT echo test run by user %s for organization %s.",
        current_user.user_id,
        current_user.organization_id,
    )
    return result
