import { AlertCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ACTION_BADGE_CONFIG,
  DEFAULT_ACTION_BADGE_CONFIG,
  isCriticalAction,
  type AuditBadgeTone,
} from "@/constants/audit";

interface ActionBadgeProps {
  actionType: string;
}

const TONE_TO_VARIANT: Record<AuditBadgeTone, "success" | "danger" | "warning" | "info" | "muted"> = {
  success: "success",
  danger: "danger",
  warning: "warning",
  info: "info",
  muted: "muted",
};

/**
 * Badge for a single audit event's action_type. Known types get their own
 * label/icon/color from `ACTION_BADGE_CONFIG`; unknown types fall back to
 * a neutral style. Independently of that lookup, any action_type
 * containing FAILED/BLOCKED/ALERT/RISK is flagged critical with a subtle
 * red background and an alert icon — so a new failure-type event the
 * frontend doesn't explicitly know about yet still reads as urgent.
 */
export function ActionBadge({ actionType }: ActionBadgeProps) {
  const config = ACTION_BADGE_CONFIG[actionType] ?? {
    ...DEFAULT_ACTION_BADGE_CONFIG,
    label: humanizeActionType(actionType),
  };
  const critical = isCriticalAction(actionType);
  const Icon = critical ? AlertCircle : config.icon;

  return (
    <Badge
      variant={TONE_TO_VARIANT[config.tone]}
      className={cn(critical && "bg-danger/10 text-danger")}
    >
      <Icon />
      {config.label}
    </Badge>
  );
}

function humanizeActionType(actionType: string): string {
  return actionType
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}
