/**
 * Types mirroring the FastAPI backend's organization/dashboard/compliance
 * endpoints (`app/api/v1/organizations.py`, Phase 8).
 */

export interface DashboardSummary {
  total_shipments: number;
  documents_processed: number;
  average_confidence: number | null;
  critical_risk_count: number;
  compliance_ready_count: number;
  needs_review_count: number;
  blocked_count: number;
}

export interface ComplianceOverview {
  shipments_requiring_review: number;
  critical_alerts: number;
  mass_balance_failures: number;
  satellite_failures: number;
  xml_generated_count: number;
  total_shipments: number;
}

export interface MembershipItem {
  organization_id: string;
  name: string;
  plan: string;
  role: string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  plan: "growth" | "enterprise" | "custom" | "demo";
  shipments_used_this_year: number;
  shipment_limit: number | null;
  created_at: string;
  member_count: number;
  sso_enabled: boolean;
  sso_domain: string | null;
  require_export_approval: boolean;
  // Only ever non-null when plan === "demo" — see the backend's
  // Organization.demo_expires_at column docstring. A demo organization
  // is hard-locked out of every authenticated request once this passes,
  // enforced on every request, not just checked at login.
  demo_expires_at: string | null;
}

export interface NotificationPreferences {
  email_on_shipment_completed: boolean;
  email_on_team_member_added: boolean;
  email_on_team_member_removed: boolean;
  email_on_plan_changed: boolean;
}

export type OrganizationRole = "owner" | "admin" | "compliance_manager" | "viewer";

export interface TeamMember {
  user_id: string;
  email: string | null;
  role: OrganizationRole;
  joined_at: string;
}
