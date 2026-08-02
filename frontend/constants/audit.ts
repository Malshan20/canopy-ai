import type { LucideIcon } from "lucide-react";
import {
  FileSearch,
  Satellite,
  SatelliteDish,
  Scale,
  ScaleIcon,
  FileCode,
  ShieldCheck,
  PencilLine,
  AlertTriangle,
} from "lucide-react";

export const AUDIT_CSV_FILENAME = "canoryai_audit_report.csv";

export type AuditBadgeTone = "success" | "danger" | "warning" | "info" | "muted";

interface ActionBadgeConfig {
  label: string;
  tone: AuditBadgeTone;
  icon: LucideIcon;
}

/**
 * Styling for every known action_type. Falls back to a neutral style (see
 * `getActionBadgeConfig` in `lib/audit.ts`) for anything not listed here —
 * new event types the backend starts emitting will still render sensibly
 * without a frontend change.
 */
export const ACTION_BADGE_CONFIG: Record<string, ActionBadgeConfig> = {
  DOCUMENT_EXTRACTED: { label: "Document Extracted", tone: "success", icon: FileSearch },
  SATELLITE_CHECK_COMPLETED: { label: "Satellite Check Completed", tone: "success", icon: Satellite },
  SATELLITE_CHECK_FAILED: { label: "Satellite Check Failed", tone: "danger", icon: SatelliteDish },
  MASS_BALANCE_PASSED: { label: "Mass Balance Passed", tone: "success", icon: Scale },
  MASS_BALANCE_FAILED: { label: "Mass Balance Failed", tone: "danger", icon: ScaleIcon },
  XML_GENERATED: { label: "XML Generated", tone: "info", icon: FileCode },
  EXPORT_APPROVED: { label: "Export Approved", tone: "success", icon: ShieldCheck },
  MANUAL_OVERRIDE: { label: "Manual Override", tone: "warning", icon: PencilLine },
};

export const DEFAULT_ACTION_BADGE_CONFIG: ActionBadgeConfig = {
  label: "Event",
  tone: "muted",
  icon: AlertTriangle,
};

/**
 * Any action_type containing one of these substrings is treated as
 * critical regardless of whether it's in ACTION_BADGE_CONFIG above —
 * catches future event types the frontend doesn't know about yet, per
 * spec ("If action contains FAILED / BLOCKED / ALERT / RISK").
 */
const CRITICAL_KEYWORDS = ["FAILED", "BLOCKED", "ALERT", "RISK"];

export function isCriticalAction(actionType: string): boolean {
  const upper = actionType.toUpperCase();
  return CRITICAL_KEYWORDS.some((keyword) => upper.includes(keyword));
}

export const CANOPY_AI_ACTOR_NAME = "CanoryAI";
