export const XML_EXPORT_FILENAME = "eudr_dds_export.xml";

export function buildXmlExportPath(shipmentId: string): string {
  return `/api/v1/shipments/${encodeURIComponent(shipmentId)}/xml`;
}

/**
 * Local storage key for remembering the operator profile (name, EORI, HS
 * code) across shipments within this browser. CanoryAI has no operator
 * management system yet — this is a convenience so a compliance officer
 * doesn't re-type the same company details for every download, not a
 * replacement for real operator/company records.
 */
export const OPERATOR_PROFILE_STORAGE_KEY = "canoryai:operator-profile";
