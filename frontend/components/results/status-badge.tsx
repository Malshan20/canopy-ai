import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  TreeDeciduous,
  Satellite,
  Clock,
  HelpCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatConfidence } from "@/lib/utils";
import type { ProcessingStatus, SatelliteVerificationResult } from "@/types/shipment";

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

interface ConfidenceBadgeProps {
  score: number | null;
}

/**
 * Confidence-tier badge per spec: green above 0.85, amber between
 * 0.60–0.85, red below 0.60. Documents without an extraction (e.g. tax_id,
 * irrelevant) render a neutral dash instead of a misleading score.
 */
export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (score >= HIGH_CONFIDENCE_THRESHOLD) {
    return (
      <Badge variant="success">
        <CheckCircle2 />
        {formatConfidence(score)} High
      </Badge>
    );
  }

  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return (
      <Badge variant="warning">
        <AlertTriangle />
        {formatConfidence(score)} Medium
      </Badge>
    );
  }

  return (
    <Badge variant="danger">
      <XCircle />
      {formatConfidence(score)} Needs review
    </Badge>
  );
}

const STATUS_CONFIG: Record<
  ProcessingStatus,
  { label: string; variant: "success" | "warning" | "danger" | "muted"; icon: typeof CheckCircle2 }
> = {
  processed: { label: "Processed", variant: "success", icon: CheckCircle2 },
  skipped_irrelevant: { label: "Skipped", variant: "muted", icon: MinusCircle },
  classification_failed: { label: "Classification failed", variant: "danger", icon: XCircle },
  extraction_failed: { label: "Extraction failed", variant: "danger", icon: XCircle },
  unsupported_file: { label: "Unsupported", variant: "muted", icon: MinusCircle },
};

export function DocumentStatusBadge({ status }: { status: ProcessingStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon />
      {config.label}
    </Badge>
  );
}

const SATELLITE_CONFIG: Record<
  SatelliteVerificationResult["status"],
  { label: string; variant: "success" | "danger" | "warning" | "muted"; icon: typeof CheckCircle2 }
> = {
  verified_clean: { label: "Clear (Post-2020)", variant: "success", icon: CheckCircle2 },
  forest_loss_detected: { label: "Critical: Deforestation Detected", variant: "danger", icon: TreeDeciduous },
  verification_pending: { label: "Pending Verification", variant: "warning", icon: Satellite },
  api_timeout: { label: "API Timeout", variant: "warning", icon: Clock },
  unknown: { label: "Unknown", variant: "muted", icon: HelpCircle },
};

interface SatelliteVerificationBadgeProps {
  verification: SatelliteVerificationResult | null;
}

/**
 * Satellite verification badge for the results table. Hovering reveals the
 * detailed verification message (e.g. which years showed tree cover loss,
 * or why a check couldn't complete) via a tooltip rather than cluttering
 * the table cell itself.
 */
export function SatelliteVerificationBadge({ verification }: SatelliteVerificationBadgeProps) {
  if (!verification) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const config = SATELLITE_CONFIG[verification.status];
  const Icon = config.icon;
  const badge = (
    <Badge variant={config.variant} className="animate-in fade-in zoom-in-95 duration-300">
      <Icon />
      {config.label}
    </Badge>
  );

  if (!verification.reason) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{verification.reason}</TooltipContent>
    </Tooltip>
  );
}
