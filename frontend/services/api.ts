import { API_BASE_URL, REQUEST_TIMEOUT_MS } from "@/constants/config";
import { UPLOAD_ENDPOINT_PATH } from "@/constants/upload";
import { buildXmlExportPath } from "@/constants/compliance-export";
import { createClient } from "@/lib/supabase/client";
import type { ApiError, ApiResult } from "@/types/api";
import type { ShipmentUploadResponse, ShipmentListResponse } from "@/types/shipment";
import type { AuditTrailResponse, OrganizationAuditTrailResponse } from "@/types/audit";
import type {
  DashboardSummary,
  ComplianceOverview,
  MembershipItem,
  NotificationPreferences,
  OrganizationProfile,
  TeamMember,
} from "@/types/organization";
import type { ApiKeyCreatedResponse, ApiKeyResponse } from "@/types/api-key";
import type { WebhookCreatedResponse, WebhookResponse } from "@/types/webhook";
import type { NotificationListResponse } from "@/types/notification";

/**
 * Attaches the current Supabase session's access token to a request as
 * `Authorization: Bearer <token>`, retrying once after a session refresh
 * if the backend responds 401 (the token expired between page load and
 * this request). If there's no session at all, or the refresh itself
 * fails, redirects to `/login` rather than returning a request the
 * backend can never accept — every route that calls this is protected by
 * `middleware.ts` anyway, so reaching this state means the client-side
 * session state is stale relative to reality.
 */
const ACTIVE_ORGANIZATION_STORAGE_KEY = "canoryai_active_organization_id";

/**
 * Which organization the current browser tab is acting as, for users who
 * belong to more than one (see the workspace switcher in
 * components/layout/header.tsx). Persisted in localStorage rather than
 * a cookie — this is a pure UI preference, not something the server
 * needs to see before the first client-side request, and keeping it
 * client-only avoids adding cookie/session complexity for a purely
 * client-driven feature. Every authenticated request attaches it as
 * `X-Organization-Id`; the backend independently re-verifies the caller
 * is actually a member of that organization on every single request
 * (see backend/app/core/auth.py's get_current_user) — this value is a
 * convenience for routing, never trusted as an authorization claim.
 */
export function getActiveOrganizationId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
}

export function setActiveOrganizationId(organizationId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId);
}

async function authenticatedFetch(url: string, init: RequestInit): Promise<Response> {
  const supabase = createClient();

  const { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    redirectToLogin();
    throw new Error("No active session.");
  }

  const activeOrganizationId = getActiveOrganizationId();
  const orgHeader: Record<string, string> = activeOrganizationId
    ? { "X-Organization-Id": activeOrganizationId }
    : {};

  let response = await fetch(url, {
    ...init,
    headers: { ...init.headers, ...orgHeader, Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    console.warn("[CanoryAI API] Received 401 — attempting session refresh and retry.");
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    accessToken = refreshData.session?.access_token;

    if (refreshError || !accessToken) {
      redirectToLogin();
      throw new Error("Session refresh failed.");
    }

    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, ...orgHeader, Authorization: `Bearer ${accessToken}` },
    });
  }

  return response;
}

function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
  }
}

/**
 * Uploads a shipment ZIP archive to the CanoryAI backend and returns a
 * normalized result. This function never throws — every failure path
 * (network outage, CORS misconfiguration, timeout, validation error,
 * server error, malformed response) is captured as a typed `ApiError` so
 * calling components can render a consistent failure UI.
 */
export async function uploadShipmentZip(
  file: File,
  totalDeclaredWeightKg: number,
): Promise<ApiResult<ShipmentUploadResponse>> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("total_declared_weight_kg", String(totalDeclaredWeightKg));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}${UPLOAD_ENDPOINT_PATH}`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The uploaded file could not be processed.",
        }),
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error("[CanoryAI API] Failed to parse JSON response:", parseError);
      return {
        ok: false,
        error: {
          kind: "unknown",
          message: "The server returned a response that could not be understood.",
        },
      };
    }

    if (!isShipmentUploadResponse(payload)) {
      console.error("[CanoryAI API] Unexpected response shape:", payload);
      return {
        ok: false,
        error: {
          kind: "unknown",
          message: "The server returned an unexpected response shape.",
        },
      };
    }

    return { ok: true, data: payload };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "uploading your file") };
  }
}

export interface ShipmentApproval {
  approved: boolean;
  approved_by_user_id: string | null;
  approved_at: string | null;
}

export function fetchShipmentExportApproval(shipmentId: string): Promise<ApiResult<ShipmentApproval>> {
  return authenticatedGetJson(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/export-approval`);
}

export async function approveShipmentExport(shipmentId: string): Promise<ApiResult<ShipmentApproval>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/shipments/${encodeURIComponent(shipmentId)}/export-approval`;

  try {
    const response = await authenticatedFetch(url, { method: "POST", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not approve this shipment for export." }),
      };
    }
    return { ok: true, data: (await response.json()) as ShipmentApproval };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "approving this shipment") };
  }
}

export interface DocumentFlag {
  shipment_id: string;
  document_id: string;
  is_flagged: boolean;
  reason: string | null;
  flagged_by_email: string | null;
  flagged_at: string | null;
  resolved_by_email: string | null;
  resolved_at: string | null;
}

export function fetchDocumentFlags(shipmentId: string): Promise<ApiResult<DocumentFlag[]>> {
  return authenticatedGetJson(`/api/v1/shipments/${encodeURIComponent(shipmentId)}/documents/flags`);
}

export async function flagDocument(
  shipmentId: string,
  documentId: string,
  reason?: string,
): Promise<ApiResult<DocumentFlag>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/shipments/${encodeURIComponent(shipmentId)}/documents/${encodeURIComponent(documentId)}/flag`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason ?? null }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not flag this document for review." }),
      };
    }
    return { ok: true, data: (await response.json()) as DocumentFlag };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "flagging this document") };
  }
}

export async function resolveDocumentFlag(
  shipmentId: string,
  documentId: string,
): Promise<ApiResult<DocumentFlag>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/shipments/${encodeURIComponent(shipmentId)}/documents/${encodeURIComponent(documentId)}/flag`;

  try {
    const response = await authenticatedFetch(url, { method: "DELETE", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not resolve this review flag." }),
      };
    }
    return { ok: true, data: (await response.json()) as DocumentFlag };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "resolving this review flag") };
  }
}

export interface SatelliteVerificationResult {
  latitude: number;
  longitude: number;
  status: "verified_clean" | "forest_loss_detected" | "verification_pending" | "api_timeout" | "unknown";
  risk: "critical" | "low" | "unknown";
  tree_cover_loss_years: number[];
  reason: string | null;
  cutoff_year: number;
}

/**
 * Live re-check of a document's coordinates against Global Forest Watch,
 * via the backend's own `GeospatialService` — the same GFW client and
 * EUDR business rules the shipment-processing pipeline itself uses.
 * Deliberately routed through the backend rather than calling GFW
 * directly from the browser: GFW's Data API requires a server-side API
 * key that a browser can't safely hold, and the backend's client already
 * has the correct retry/redirect handling this needs.
 */
export async function verifyDocumentSatellite(
  shipmentId: string,
  documentId: string,
  latitude: number,
  longitude: number,
): Promise<ApiResult<SatelliteVerificationResult>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/shipments/${encodeURIComponent(shipmentId)}/documents/${encodeURIComponent(documentId)}/verify-satellite`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not verify this location against satellite imagery." }),
      };
    }
    return { ok: true, data: (await response.json()) as SatelliteVerificationResult };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "verifying against satellite imagery") };
  }
}

export interface XmlDownloadParams {
  operatorType: "OPERATOR" | "TRADER";
  activityType: "TRADE" | "IMPORT" | "EXPORT" | "DOMESTIC";
  countryOfActivity: string;
  borderCrossCountry: string;
  operatorName: string;
  operatorCountry: string;
  operatorAddress: string;
  operatorEmail: string;
  operatorPhone: string;
  operatorEori?: string;
  hsCode: string;
  commodityDescription?: string;
  countryOfProduction?: string;
  geolocationConfidential: boolean;
}

/**
 * Requests a DDS document for a shipment and returns it as a `Blob`,
 * ready to be handed to an object URL for download. A POST with a JSON
 * body, not GET + query params: the real DDS schema needs substantially
 * more fields than a query string comfortably carries (see
 * backend/app/schemas/shipment_summary.py's GenerateDdsXmlRequest).
 * Like `uploadShipmentZip`, this never throws — every failure (shipment
 * not found, compliance not passed, server error, network/CORS failure)
 * comes back as a typed `ApiError`.
 */
export async function downloadShipmentXml(
  shipmentId: string,
  params: XmlDownloadParams,
): Promise<ApiResult<Blob>> {
  const body = {
    operator_type: params.operatorType,
    activity_type: params.activityType,
    country_of_activity: params.countryOfActivity,
    border_cross_country: params.borderCrossCountry,
    operator_name: params.operatorName,
    operator_country: params.operatorCountry,
    operator_address: params.operatorAddress,
    operator_email: params.operatorEmail,
    operator_phone: params.operatorPhone,
    operator_eori: params.operatorEori || undefined,
    hs_code: params.hsCode,
    commodity_description: params.commodityDescription || undefined,
    country_of_production: params.countryOfProduction || undefined,
    geolocation_confidential: params.geolocationConfidential,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}${buildXmlExportPath(shipmentId)}`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The DDS document could not be generated for this shipment.",
          notFoundMessage: "This shipment could not be found. It may have expired from the server.",
        }),
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("xml")) {
      console.error("[CanoryAI API] Expected an XML response but got:", contentType);
      return {
        ok: false,
        error: {
          kind: "unknown",
          message: "The server returned a response that wasn't valid XML.",
        },
      };
    }

    const blob = await response.blob();
    return { ok: true, data: blob };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "generating the XML file") };
  }
}

/**
 * Fetches the complete, chronological audit trail for a shipment from the
 * immutable Audit Vault. Same never-throws contract as every other
 * function in this file.
 */
export async function fetchAuditTrail(shipmentId: string): Promise<ApiResult<AuditTrailResponse>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}${buildAuditTrailPath(shipmentId)}`;

  try {
    const response = await authenticatedFetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The audit trail could not be retrieved for this shipment.",
          notFoundMessage: "This shipment could not be found. It may have expired from the server.",
        }),
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error("[CanoryAI API] Failed to parse audit trail response:", parseError);
      return {
        ok: false,
        error: { kind: "unknown", message: "The server returned a response that could not be understood." },
      };
    }

    if (!isAuditTrailResponse(payload)) {
      console.error("[CanoryAI API] Unexpected audit trail response shape:", payload);
      return {
        ok: false,
        error: { kind: "unknown", message: "The server returned an unexpected response shape." },
      };
    }

    return { ok: true, data: payload };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "loading the audit trail") };
  }
}

function buildAuditTrailPath(shipmentId: string): string {
  return `/api/v1/shipments/${encodeURIComponent(shipmentId)}/audit-trail`;
}

function isAuditTrailResponse(value: unknown): value is AuditTrailResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.shipment_id === "string" && Array.isArray(record.events);
}

interface ErrorMessageOverrides {
  fallbackMessage: string;
  notFoundMessage?: string;
}

async function buildErrorFromResponse(
  response: Response,
  overrides: ErrorMessageOverrides,
): Promise<ApiError> {
  let detail: string | undefined;
  try {
    const body = await response.json();
    detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
  } catch {
    detail = undefined;
  }

  console.error(
    `[CanoryAI API] Request failed with status ${response.status}:`,
    detail ?? response.statusText,
  );

  if (response.status === 404) {
    return {
      kind: "validation",
      message: overrides.notFoundMessage ?? detail ?? "The requested resource was not found.",
      status: response.status,
      detail,
    };
  }

  if (response.status >= 500) {
    return {
      kind: "server",
      message: "The server encountered an error while processing your request.",
      status: response.status,
      detail,
    };
  }

  if (response.status === 429) {
    return {
      kind: "server",
      message: "The AI provider is currently rate-limited. Please try again shortly.",
      status: response.status,
      detail,
    };
  }

  if (response.status >= 400) {
    return {
      kind: "validation",
      message: detail ?? overrides.fallbackMessage,
      status: response.status,
      detail,
    };
  }

  return {
    kind: "unknown",
    message: "An unexpected response was received from the server.",
    status: response.status,
    detail,
  };
}

function normalizeThrownError(error: unknown, url: string, actionLabel: string): ApiError {
  if (error instanceof DOMException && error.name === "AbortError") {
    console.error(`[CanoryAI API] Request to ${url} timed out.`);
    return {
      kind: "timeout",
      message: "The request took too long to respond. Large archives may need more time.",
    };
  }

  if (error instanceof TypeError) {
    // In browsers, a failed fetch (network down, DNS failure, or a CORS
    // preflight rejection) surfaces as an opaque TypeError with no status
    // code — there is no reliable way to distinguish "network" from "CORS"
    // from the exception alone, so we log context and give the most
    // actionable general guidance.
    console.error(
      `[CanoryAI API] Network or CORS error calling ${url}:`,
      error.message,
    );
    return {
      kind: "network",
      message:
        "Could not reach the CanoryAI backend. Check that the API is running and that CORS is configured for this origin.",
    };
  }

  console.error(`[CanoryAI API] Unexpected error calling ${url}:`, error);
  return {
    kind: "unknown",
    message: `An unexpected error occurred while ${actionLabel}.`,
  };
}

function isShipmentUploadResponse(value: unknown): value is ShipmentUploadResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.shipment_id === "string" &&
    typeof record.documents_processed === "number" &&
    Array.isArray(record.documents) &&
    typeof record.compliance === "object" &&
    record.compliance !== null
  );
}

/**
 * Generic authenticated GET-JSON helper for the simple, read-only Phase 8
 * endpoints (shipments list, dashboard summary, compliance overview,
 * organization profile, team members, org-wide audit trail) — every one
 * of these follows the identical shape (authenticated GET, parse JSON,
 * normalize failures), so this is the single place that logic lives
 * rather than six near-identical copies of it.
 */
async function authenticatedGetJson<T>(path: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}${path}`;

  try {
    const response = await authenticatedFetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The request could not be completed.",
        }),
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "loading data") };
  }
}

export function fetchShipmentsList(page = 1, pageSize = 25): Promise<ApiResult<ShipmentListResponse>> {
  return authenticatedGetJson(`/api/v1/shipments?page=${page}&page_size=${pageSize}`);
}

export function fetchDashboardSummary(): Promise<ApiResult<DashboardSummary>> {
  return authenticatedGetJson("/api/v1/organizations/me/summary");
}

export function fetchComplianceOverview(): Promise<ApiResult<ComplianceOverview>> {
  return authenticatedGetJson("/api/v1/organizations/me/compliance-overview");
}

export function fetchNotificationPreferences(): Promise<ApiResult<NotificationPreferences>> {
  return authenticatedGetJson("/api/v1/organizations/me/notification-preferences");
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<ApiResult<NotificationPreferences>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/organizations/me/notification-preferences`;

  try {
    const response = await authenticatedFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not update notification preferences." }),
      };
    }
    return { ok: true, data: (await response.json()) as NotificationPreferences };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "updating notification preferences") };
  }
}

export async function updateExportApprovalSetting(
  requireExportApproval: boolean,
): Promise<ApiResult<OrganizationProfile>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/organizations/me/export-approval-setting`;

  try {
    const response = await authenticatedFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ require_export_approval: requireExportApproval }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not update this setting." }),
      };
    }
    return { ok: true, data: (await response.json()) as OrganizationProfile };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "updating this setting") };
  }
}

export function fetchOrganizationProfile(): Promise<ApiResult<OrganizationProfile>> {
  return authenticatedGetJson("/api/v1/organizations/me");
}

export function fetchMemberships(): Promise<ApiResult<MembershipItem[]>> {
  return authenticatedGetJson("/api/v1/organizations/me/memberships");
}

export function fetchTeamMembers(): Promise<ApiResult<TeamMember[]>> {
  return authenticatedGetJson("/api/v1/organizations/me/members");
}

export function fetchOrganizationAuditTrail(
  page = 1,
  pageSize = 50,
): Promise<ApiResult<OrganizationAuditTrailResponse>> {
  return authenticatedGetJson(`/api/v1/audit-trail?page=${page}&page_size=${pageSize}`);
}

/**
 * Fetches a shipment's full result directly from the backend — used as a
 * fallback when it isn't in this browser's `sessionStorage` (a different
 * session/device/tab processed it, or the tab was closed and reopened).
 * The backend itself falls back from its in-memory cache to a durable
 * Postgres-stored copy, so this works regardless of which worker process
 * originally handled the upload — see `GET /shipments/{id}`'s docstring
 * in `backend/app/api/v1/shipments.py`.
 */
export function fetchShipmentDetail(shipmentId: string): Promise<ApiResult<ShipmentUploadResponse>> {
  return authenticatedGetJson(`/api/v1/shipments/${encodeURIComponent(shipmentId)}`);
}

export interface SsoLookupResult {
  sso_enabled: boolean;
  redirect_url: string | null;
}

/**
 * Public — deliberately does NOT go through authenticatedFetch, since
 * this is called before any session exists at all (that's the entire
 * point: "should I show a password field for this email").
 */
export async function checkSsoDomain(domain: string): Promise<SsoLookupResult | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/sso-lookup?domain=${encodeURIComponent(domain)}`);
    if (!response.ok) return null;
    return (await response.json()) as SsoLookupResult;
  } catch {
    // Network hiccup on this check should never block normal password
    // login — fail open to the regular flow, not to an error state.
    return null;
  }
}

export function fetchApiKeys(): Promise<ApiResult<ApiKeyResponse[]>> {
  return authenticatedGetJson("/api/v1/api-keys");
}

export interface ContactTicketMessage {
  id: string;
  sender_type: "customer" | "admin";
  sender_name: string;
  body: string;
  created_at: string;
}

export interface ContactTicketDetail {
  ticket_number: string;
  name: string;
  email: string;
  company: string | null;
  subject: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  messages: ContactTicketMessage[];
}

/**
 * All three contact-ticket functions below are deliberately public — no
 * authenticatedFetch, no Supabase session — since a prospective customer
 * submitting the form has no CanoryAI account at all. Ownership is
 * verified server-side by ticket number + email instead (see
 * backend/app/api/v1/contact.py).
 */
export async function createContactTicket(input: {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
}): Promise<ApiResult<{ ticket_number: string }>> {
  const url = `${API_BASE_URL}/api/v1/contact`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return { ok: false, error: await buildErrorFromResponse(response, { fallbackMessage: "Could not submit your message." }) };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: normalizeThrownError(error, url, "submitting the contact form") };
  }
}

export async function fetchContactTicket(ticketNumber: string, email: string): Promise<ApiResult<ContactTicketDetail>> {
  const url = `${API_BASE_URL}/api/v1/contact/${encodeURIComponent(ticketNumber)}?email=${encodeURIComponent(email)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: await buildErrorFromResponse(response, { fallbackMessage: "Could not find that ticket." }) };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: normalizeThrownError(error, url, "looking up the ticket") };
  }
}

export async function replyToContactTicket(
  ticketNumber: string,
  input: { email: string; message: string },
): Promise<ApiResult<ContactTicketDetail>> {
  const url = `${API_BASE_URL}/api/v1/contact/${encodeURIComponent(ticketNumber)}/reply`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      return { ok: false, error: await buildErrorFromResponse(response, { fallbackMessage: "Could not send your reply." }) };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: normalizeThrownError(error, url, "sending your reply") };
  }
}

export function fetchNotifications(): Promise<ApiResult<NotificationListResponse>> {
  return authenticatedGetJson("/api/v1/notifications");
}

export async function markNotificationRead(notificationId: string): Promise<ApiResult<void>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/notifications/${encodeURIComponent(notificationId)}/read`;

  try {
    const response = await authenticatedFetch(url, { method: "PATCH", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not mark this notification as read." }),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "updating the notification") };
  }
}

export async function markAllNotificationsRead(): Promise<ApiResult<void>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/notifications/mark-all-read`;

  try {
    const response = await authenticatedFetch(url, { method: "POST", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "Could not mark notifications as read." }),
      };
    }
    return { ok: true, data: undefined };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "updating notifications") };
  }
}

/**
 * Creates a new API key. The response's `key` field is the plaintext
 * credential — the ONLY time it is ever available. The caller (see
 * `components/settings/api-keys-section.tsx`) is responsible for showing
 * it with a "copy this now, you won't see it again" warning; this
 * function itself never logs or persists it anywhere beyond the return value.
 */
export async function createApiKey(name: string): Promise<ApiResult<ApiKeyCreatedResponse>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/api-keys`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The API key could not be created.",
        }),
      };
    }

    const data = (await response.json()) as ApiKeyCreatedResponse;
    return { ok: true, data };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "creating the API key") };
  }
}

export async function revokeApiKey(apiKeyId: string): Promise<ApiResult<void>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/api-keys/${encodeURIComponent(apiKeyId)}`;

  try {
    const response = await authenticatedFetch(url, { method: "DELETE", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The API key could not be revoked.",
          notFoundMessage: "This API key no longer exists.",
        }),
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "revoking the API key") };
  }
}

// NOTE: there is deliberately no createOrganization() here anymore. It
// called POST /api/v1/organizations, the self-serve signup bootstrap
// endpoint — any freshly self-registered account could call it and
// become the owner of a brand-new organization, with zero invitation or
// approval. That backend route has been removed entirely (see
// backend/app/api/v1/organizations.py); this isn't just a frontend UI
// change. Workspaces are now provisioned internally, via the separate
// admin panel.

export async function inviteTeamMember(email: string, role: string): Promise<ApiResult<TeamMember>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/organizations/me/members`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "This person could not be added to your organization.",
          notFoundMessage: "No account exists yet for that email. They need to sign up first.",
        }),
      };
    }

    const data = (await response.json()) as TeamMember;
    return { ok: true, data };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "adding the team member") };
  }
}

export async function updateTeamMemberRole(userId: string, role: string): Promise<ApiResult<TeamMember>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/organizations/me/members/${encodeURIComponent(userId)}`;

  try {
    const response = await authenticatedFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "The role could not be changed." }),
      };
    }

    const data = (await response.json()) as TeamMember;
    return { ok: true, data };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "updating the role") };
  }
}

export async function removeTeamMember(userId: string): Promise<ApiResult<void>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/organizations/me/members/${encodeURIComponent(userId)}`;

  try {
    const response = await authenticatedFetch(url, { method: "DELETE", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "This team member could not be removed.",
        }),
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "removing the team member") };
  }
}

export function fetchWebhooks(): Promise<ApiResult<WebhookResponse[]>> {
  return authenticatedGetJson("/api/v1/webhooks");
}

export async function createWebhook(webhookUrl: string): Promise<ApiResult<WebhookCreatedResponse>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/webhooks`;

  try {
    const response = await authenticatedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, { fallbackMessage: "The webhook could not be created." }),
      };
    }

    const data = (await response.json()) as WebhookCreatedResponse;
    return { ok: true, data };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "creating the webhook") };
  }
}

export async function deleteWebhook(webhookId: string): Promise<ApiResult<void>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${API_BASE_URL}/api/v1/webhooks/${encodeURIComponent(webhookId)}`;

  try {
    const response = await authenticatedFetch(url, { method: "DELETE", signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: await buildErrorFromResponse(response, {
          fallbackMessage: "The webhook could not be deleted.",
          notFoundMessage: "This webhook no longer exists.",
        }),
      };
    }

    return { ok: true, data: undefined };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, error: normalizeThrownError(error, url, "deleting the webhook") };
  }
}
