import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names safely, resolving conflicting utility classes
 * (e.g. `p-2 p-4` -> `p-4`). Used by every component in `components/ui`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a byte count as a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

/**
 * Format seconds as a human-readable duration, e.g. "4.2s" or "1m 12s".
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}

/**
 * Format a 0–1 confidence score as a whole-number percentage string.
 */
export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Format an ISO-ish date string (YYYY-MM-DD) for display. Falls back to the
 * raw value if it cannot be parsed, since backend data is not guaranteed to
 * be a valid date (AI extraction can return null or partial values upstream).
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a full ISO timestamp (date + time, e.g. audit log entries) for
 * display in the user's local timezone. Falls back to the raw value if it
 * cannot be parsed.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * "3 days left" / "Expires today" / "Expired 2 days ago" for
 * `OrganizationProfile.demo_expires_at`. Returns null for anything that
 * isn't a real, parseable timestamp — callers should treat that as
 * "don't show a countdown," not as an error. Deliberately duplicated in
 * the separate admin-panel project's lib/utils.ts (formatDemoCountdown)
 * rather than shared — the two are genuinely separate codebases with no
 * shared package between them.
 */
export function formatDemoCountdown(demoExpiresAt: string | null | undefined): string | null {
  if (!demoExpiresAt) return null;
  const expires = new Date(demoExpiresAt);
  if (Number.isNaN(expires.getTime())) return null;

  const msRemaining = expires.getTime() - Date.now();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  if (daysRemaining > 1) return `${daysRemaining} days left`;
  if (daysRemaining === 1) return "1 day left";
  if (daysRemaining === 0) return "Expires today";
  const daysAgo = Math.abs(daysRemaining);
  return `Expired ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
}
