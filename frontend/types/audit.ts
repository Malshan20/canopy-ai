/**
 * Types mirroring the CanoryAI FastAPI backend contract for
 * `GET /api/v1/shipments/{shipment_id}/audit-trail`.
 */

/**
 * The canonical action_type values currently emitted by the platform.
 * The backend column is a plain string (so new event types don't need a
 * frontend deploy to appear), but every *known* type is listed here for
 * badge styling — see `constants/audit.ts`. Unknown types still render,
 * just with a neutral fallback style.
 */
export type AuditActionType =
  | "DOCUMENT_EXTRACTED"
  | "SATELLITE_CHECK_COMPLETED"
  | "SATELLITE_CHECK_FAILED"
  | "MASS_BALANCE_PASSED"
  | "MASS_BALANCE_FAILED"
  | "XML_GENERATED"
  | "MANUAL_OVERRIDE"
  | (string & {});

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action_type: AuditActionType;
  details: Record<string, unknown>;
}

export interface AuditTrailResponse {
  shipment_id: string;
  events: AuditEvent[];
}

/** Response for GET /api/v1/audit-trail — organization-wide, paginated. */
export interface OrganizationAuditTrailResponse {
  events: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
}
