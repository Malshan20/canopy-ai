import type { DocumentResult, ShipmentSummary } from "@/types/shipment";

const HIGH_RISK_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Derives the results-dashboard summary metrics from the raw backend
 * response. Kept separate from the components so the aggregation logic is
 * unit-testable in isolation.
 */
export function summarizeShipment(
  documents: DocumentResult[],
  processingTimeSeconds: number | null,
): ShipmentSummary {
  const withExtraction = documents.filter((doc) => doc.extracted_data !== null);
  const farmersFound = withExtraction.filter((doc) => Boolean(doc.extracted_data?.farmer_name));

  const averageConfidence =
    withExtraction.length > 0
      ? withExtraction.reduce((sum, doc) => sum + (doc.extracted_data?.ai_confidence_score ?? 0), 0) /
        withExtraction.length
      : null;

  const highRiskDocuments = withExtraction.filter(
    (doc) => (doc.extracted_data?.ai_confidence_score ?? 1) < HIGH_RISK_CONFIDENCE_THRESHOLD,
  ).length;

  const warnings = documents.filter(
    (doc) => doc.status === "classification_failed" || doc.status === "extraction_failed",
  ).length;

  return {
    totalDocuments: documents.length,
    extractedFarmers: farmersFound.length,
    averageConfidence,
    highRiskDocuments,
    warnings,
    processingTimeSeconds,
  };
}
