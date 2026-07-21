/**
 * Types mirroring the CanoryAI FastAPI backend contract for
 * `POST /api/v1/shipments/upload-zip`.
 *
 * Keeping these in lockstep with `app/schemas/*` on the backend is
 * intentional — this file is the single source of truth for shipment
 * data shapes on the frontend.
 */

export type DocumentClassification =
  | "weighbridge_receipt"
  | "land_deed"
  | "tax_id"
  | "due_diligence_statement"
  | "irrelevant";

export type ProcessingStatus =
  | "processed"
  | "skipped_irrelevant"
  | "classification_failed"
  | "extraction_failed"
  | "unsupported_file";

export interface ExtractedData {
  farmer_name: string | null;
  crop_weight_kg: number | null;
  date_of_transaction: string | null;
  gps_coordinates: string | null;
  ai_confidence_score: number;

  supplier_name: string | null;
  village: string | null;
  commodity: string | null;
  receipt_number: string | null;
  country: string | null;
  language_detected: string | null;
  document_notes: string | null;

  // Due diligence statement fields (EUDR DDS / deforestation-free evidence reports).
  operator_name: string | null;
  hs_code: string | null;
  product_name: string | null;
  quantity_kg: number | null;
  reference_number: string | null;
  statement_date: string | null;
  deforestation_free_declared: boolean | null;
  legal_compliance_conformity: boolean | null;
  geolocation_evidence_present: boolean | null;
}

export interface DocumentResult {
  document_id: string;
  filename: string;
  classification: DocumentClassification;
  status: ProcessingStatus;
  extracted_data: ExtractedData | null;
  error_detail: string | null;
  satellite_verification: SatelliteVerificationResult | null;
  plausibility_flags: string[];
}

// --- Compliance Engine (Phase 3): satellite verification + mass balance ---

export type SatelliteVerificationStatus =
  | "verified_clean"
  | "forest_loss_detected"
  | "verification_pending"
  | "api_timeout"
  | "unknown";

export type SatelliteRisk = "critical" | "low" | "unknown";

export interface SatelliteVerificationResult {
  latitude: number;
  longitude: number;
  status: SatelliteVerificationStatus;
  risk: SatelliteRisk;
  tree_cover_loss_years: number[];
  reason: string | null;
  cutoff_year: number;
}

export type MassBalanceStatus = "compliant" | "mass_balance_mismatch";
export type MassBalanceSeverity = "none" | "warning" | "critical";

export interface MassBalanceResult {
  declared_weight_kg: number;
  extracted_weight_kg: number;
  difference_kg: number;
  percentage_difference: number;
  tolerance_percentage: number;
  status: MassBalanceStatus;
  severity: MassBalanceSeverity;
  suggested_action: string;
  documents_included: number;
  documents_excluded: number;
}

export type ComplianceReadiness = "ready" | "needs_review" | "blocked";

export interface ComplianceSummary {
  readiness: ComplianceReadiness;
  critical_farms: number;
  verified_farms: number;
  pending_verification: number;
  percentage_verified: number;
  total_coordinates_checked: number;
  mass_balance: MassBalanceResult;
  plausibility_flag_count: number;
}

export interface ShipmentUploadResponse {
  shipment_id: string;
  documents_processed: number;
  documents: DocumentResult[];
  compliance: ComplianceSummary;
}

// --- Shipments list (Phase 8) ---

export interface ShipmentListItem {
  id: string;
  source_filename: string | null;
  commodity: string | null;
  country_of_production: string | null;
  declared_weight_kg: number | null;
  documents_processed: number | null;
  average_confidence: number | null;
  critical_farms: number | null;
  readiness: ComplianceReadiness | null;
  mass_balance_status: MassBalanceStatus | null;
  created_at: string;
}

export interface ShipmentListResponse {
  shipments: ShipmentListItem[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Frontend-only derived summary computed from a `ShipmentUploadResponse`.
 * Not returned by the backend — assembled client-side for the results
 * dashboard's summary cards.
 */
export interface ShipmentSummary {
  totalDocuments: number;
  extractedFarmers: number;
  averageConfidence: number | null;
  highRiskDocuments: number;
  warnings: number;
  processingTimeSeconds: number | null;
}

/**
 * A processed shipment persisted client-side (sessionStorage) so the
 * results dashboard can be reached via a real, shareable-within-session
 * URL (`/shipments/[shipmentId]`) rather than only via in-memory router
 * state.
 */
export interface StoredShipmentResult {
  response: ShipmentUploadResponse;
  receivedAt: string;
  processingTimeSeconds: number;
  sourceFilename: string;
}
