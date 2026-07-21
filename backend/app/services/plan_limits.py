"""
Plan limits and feature gates — makes the pricing page's per-tier numbers
(shipments/year, team seats, documents per shipment, max file size, API
access) real, enforced values rather than decorative marketing text.

--------------------------------------------------------------------------
HOW AN ORGANIZATION'S PLAN GETS SET TODAY (read before assuming this is
wired to real billing — it isn't yet)
--------------------------------------------------------------------------
There is no payment processor or billing system integrated anywhere in
this codebase. `organizations.plan` defaults to `"growth"` for every new
organization and is changed via `PATCH /api/v1/organizations/me`
(owner/admin only, see app/api/v1/organizations.py) — an interim, manual
mechanism. In a real launch, this column should instead be written by a
Stripe (or equivalent) webhook handler reacting to actual subscription
events, with the manual PATCH endpoint either removed or restricted to
internal admin tooling only. Shipping this interim version rather than
leaving the limits unenforced entirely is a deliberate trade-off: an
honest, enforced number tied to a manually-set plan is more truthful to
customers than an advertised limit nothing checks at all — but it is not
a substitute for real billing before charging anyone money.
"""

from __future__ import annotations

from datetime import datetime, timezone

# None means unlimited. Keep in sync with Organization.VALID_PLANS
# (app/models/organization.py) and the pricing copy in
# frontend/components/landing/pricing.tsx — these numbers are quoted
# directly from that page, not independently guessed here.
PLAN_SHIPMENT_LIMITS: dict[str, int | None] = {
    "growth": 250,
    "enterprise": 1000,
    "custom": None,
    # Not on pricing.tsx — a sales-provisioned trial, not a public tier
    # (see plan_limits.py's module docstring's "how a plan gets set"
    # section, and app/api/v1/organizations.py's update_organization_plan
    # for where demo_expires_at is set). 5 shipments is generous relative
    # to the real limit that matters for a demo — the 7-day hard lock in
    # app/core/auth.py — this exists as a sane secondary bound, not the
    # primary control.
    "demo": 5,
}


def get_shipment_limit(plan: str) -> int | None:
    """The annual shipment limit for a plan, or `None` if unlimited."""
    return PLAN_SHIPMENT_LIMITS.get(plan, PLAN_SHIPMENT_LIMITS["growth"])


# Priority processing (Enterprise/Custom tiers) — see
# app/models/processing_job.py for the full queue design. Higher value =
# claimed sooner by the worker; Growth still gets processed, never starved,
# just after any currently-queued higher-priority jobs (see that model's
# claim query: ORDER BY priority DESC, created_at ASC).
PRIORITY_BY_PLAN: dict[str, int] = {
    "growth": 0,
    "enterprise": 10,
    "custom": 10,
}


def get_job_priority(plan: str) -> int:
    return PRIORITY_BY_PLAN.get(plan, PRIORITY_BY_PLAN["growth"])


def current_billing_year_start() -> datetime:
    """
    Start of the current calendar year, UTC — the window
    "N shipments per year" resets against. A real subscription-billing
    system would anchor this to each customer's actual subscription
    anniversary instead of the calendar year; calendar-year is a
    reasonable, honest simplification in the absence of one.
    """
    now = datetime.now(timezone.utc)
    return datetime(year=now.year, month=1, day=1, tzinfo=timezone.utc)


# API access (API keys + webhooks) — pricing.tsx lists "API access" as a
# new Enterprise-tier feature, explicitly NOT included in Growth's feature
# list. This was previously advertised-only: nothing anywhere actually
# checked it, so any Growth organization could create and use API keys
# and webhooks exactly like an Enterprise one. See app/api/v1/api_keys.py
# and app/api/v1/webhooks.py for where this is enforced.
PLAN_HAS_API_ACCESS: dict[str, bool] = {
    "growth": False,
    "enterprise": True,
    "custom": True,
    "demo": False,
}


def plan_has_api_access(plan: str) -> bool:
    return PLAN_HAS_API_ACCESS.get(plan, False)


# Team member seats — pricing.tsx: Growth "Up to 5", Enterprise "Up to 25",
# Custom "Unlimited". Previously unenforced: member_count was computed and
# *displayed* on the organization profile, but nothing stopped an owner
# from inviting a 6th, 60th, or 600th member on any plan. See
# app/api/v1/organizations.py's invite_team_member.
PLAN_TEAM_MEMBER_LIMITS: dict[str, int | None] = {
    "growth": 5,
    "enterprise": 25,
    "custom": None,
    "demo": 2,
}


def get_team_member_limit(plan: str) -> int | None:
    return PLAN_TEAM_MEMBER_LIMITS.get(plan, PLAN_TEAM_MEMBER_LIMITS["growth"])


# Documents per shipment — pricing.tsx: Growth "Up to 25", Enterprise
# "Up to 100", Custom "Unlimited". Previously unenforced: a Growth
# organization could upload a ZIP containing any number of documents in a
# single shipment. See app/services/shipment_processor.py's
# process_from_zip_path, checked right after the ZIP is scanned and
# before the (costly) classification/extraction fan-out begins.
PLAN_DOCUMENTS_PER_SHIPMENT_LIMITS: dict[str, int | None] = {
    "growth": 25,
    "enterprise": 100,
    "custom": None,
    # Deliberately tight — a demo needs to show the real pipeline works
    # end to end, not process a realistic volume. Every feature still
    # runs in full (AI extraction, satellite verification, mass balance,
    # plausibility checks, DDS generation) on those 2 documents.
    "demo": 2,
}


def get_documents_per_shipment_limit(plan: str) -> int | None:
    return PLAN_DOCUMENTS_PER_SHIPMENT_LIMITS.get(plan, PLAN_DOCUMENTS_PER_SHIPMENT_LIMITS["growth"])


# Max size per uploaded document — pricing.tsx: Growth "25 MB", Enterprise
# "100 MB", Custom "Negotiated per contract". Previously a SINGLE flat
# limit (settings.MAX_SINGLE_FILE_SIZE_BYTES, 25 MB) applied to every
# plan — meaning Enterprise and Custom customers were silently capped at
# the Growth number the whole time, the opposite direction of the API
# access gap but just as real a broken promise. "Negotiated per contract"
# can't be automated without an actual contract to read, so Custom gets a
# generous, clearly-documented default rather than no cap at all; revisit
# this number per contract if a Custom customer's actual negotiated file
# size differs. Bounded above by settings.MAX_ZIP_SIZE_BYTES either way,
# which is a hard infrastructure ceiling, not a plan feature.
PLAN_MAX_FILE_SIZE_BYTES: dict[str, int] = {
    "growth": 25 * 1024 * 1024,
    "enterprise": 100 * 1024 * 1024,
    "custom": 100 * 1024 * 1024,
    "demo": 25 * 1024 * 1024,
}


def get_max_file_size_bytes(plan: str) -> int:
    return PLAN_MAX_FILE_SIZE_BYTES.get(plan, PLAN_MAX_FILE_SIZE_BYTES["growth"])
