export const ACCEPTED_FILE_EXTENSION = ".zip";
export const ACCEPTED_MIME_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_UPLOAD_SIZE_LABEL = "50 MB";

export const UPLOAD_ENDPOINT_PATH = "/api/v1/shipments/upload-zip";

/**
 * Ordered processing steps shown in the loading experience. These are
 * illustrative of the backend pipeline (see `ShipmentProcessingService`)
 * — the UI advances through them on a timer since the backend returns a
 * single response rather than progress events.
 */
export const PROCESSING_STEPS = [
  { id: "upload", label: "Upload complete" },
  { id: "extract", label: "Extracting ZIP archive" },
  { id: "classify", label: "Classifying documents" },
  { id: "handwriting", label: "Reading handwriting & scanned text" },
  { id: "gps", label: "Validating GPS coordinates" },
  { id: "satellite", label: "Running satellite deforestation checks" },
  { id: "mass_balance", label: "Calculating mass balance" },
  { id: "finalize", label: "Finalizing compliance report" },
] as const;

export type ProcessingStepId = (typeof PROCESSING_STEPS)[number]["id"];
