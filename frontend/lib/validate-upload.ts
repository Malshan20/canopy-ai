import {
  ACCEPTED_FILE_EXTENSION,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
} from "@/constants/upload";
import { formatFileSize } from "@/lib/utils";

export interface FileValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Validates a candidate upload file entirely client-side, before any
 * network request is made. Mirrors (a subset of) the backend's own
 * validation so users get instant feedback rather than a round trip.
 */
export function validateUploadFile(file: File): FileValidationResult {
  const hasZipExtension = file.name.toLowerCase().endsWith(ACCEPTED_FILE_EXTENSION);
  if (!hasZipExtension) {
    return {
      valid: false,
      message: `"${file.name}" isn't a ZIP archive. Only .zip files are accepted.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, message: `"${file.name}" is empty.` };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      message: `"${file.name}" is ${formatFileSize(file.size)}, which exceeds the ${MAX_UPLOAD_SIZE_LABEL} limit.`,
    };
  }

  return { valid: true };
}

/**
 * Validates the user-entered declared shipment weight before allowing
 * upload — mirrors the backend's `gt=0` constraint on
 * `total_declared_weight_kg` so a bad value is caught instantly rather than
 * via a round-trip 422.
 */
export function validateDeclaredWeight(rawValue: string): FileValidationResult {
  if (!rawValue.trim()) {
    return { valid: false, message: "Enter the shipment's total declared weight." };
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return { valid: false, message: "Declared weight must be a number." };
  }

  if (parsed <= 0) {
    return { valid: false, message: "Declared weight must be greater than 0." };
  }

  return { valid: true };
}
