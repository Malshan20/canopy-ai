import type { LucideIcon } from "lucide-react";
import {
  FileStack,
  Users,
  Gauge,
  Timer,
  AlertTriangle,
  ShieldAlert,
  Scale,
  TreeDeciduous,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  CheckCircle2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatConfidence, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ComplianceSummary, ShipmentSummary } from "@/types/shipment";

interface SummaryCardConfig {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger";
}

export function SummaryCards({ summary }: { summary: ShipmentSummary }) {
  const cards: SummaryCardConfig[] = [
    { label: "Total documents", value: summary.totalDocuments.toString(), icon: FileStack },
    { label: "Extracted farmers", value: summary.extractedFarmers.toString(), icon: Users },
    {
      label: "Average confidence",
      value: summary.averageConfidence !== null ? formatConfidence(summary.averageConfidence) : "—",
      icon: Gauge,
    },
    {
      label: "Processing time",
      value:
        summary.processingTimeSeconds !== null
          ? formatDuration(summary.processingTimeSeconds)
          : "—",
      icon: Timer,
    },
    {
      label: "Warnings",
      value: summary.warnings.toString(),
      icon: AlertTriangle,
      tone: summary.warnings > 0 ? "warning" : "default",
    },
    {
      label: "High-risk documents",
      value: summary.highRiskDocuments.toString(),
      icon: ShieldAlert,
      tone: summary.highRiskDocuments > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <div
              className={cn(
                "mb-3 flex size-9 items-center justify-center rounded-lg",
                card.tone === "warning" && "bg-warning/10",
                card.tone === "danger" && "bg-danger/10",
                (!card.tone || card.tone === "default") && "bg-accent",
              )}
            >
              <card.icon
                className={cn(
                  "size-4.5",
                  card.tone === "warning" && "text-warning",
                  card.tone === "danger" && "text-danger",
                  (!card.tone || card.tone === "default") && "text-primary",
                )}
                aria-hidden="true"
              />
            </div>
            <p
              key={card.value}
              className="animate-in fade-in slide-in-from-bottom-1 text-2xl font-semibold tracking-tight text-foreground duration-300"
            >
              {card.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const READINESS_CONFIG: Record<
  ComplianceSummary["readiness"],
  { label: string; description: string; icon: LucideIcon; tone: "success" | "warning" | "danger" }
> = {
  ready: {
    label: "Ready",
    description: "All checks passed — this shipment is ready for customs submission.",
    icon: ShieldCheck,
    tone: "success",
  },
  needs_review: {
    label: "Needs Review",
    description: "Some checks are unresolved or borderline. Review flagged items before submitting.",
    icon: ShieldQuestion,
    tone: "warning",
  },
  blocked: {
    label: "Blocked",
    description: "Critical compliance failures were found. This shipment cannot be submitted as-is.",
    icon: ShieldX,
    tone: "danger",
  },
};

/**
 * The three Compliance Engine cards: mass balance, deforestation risk, and
 * the combined readiness verdict. Rendered together beneath the generic
 * document-overview cards on the shipment results page.
 */
export function ComplianceCards({ compliance }: { compliance: ComplianceSummary }) {
  const { mass_balance: massBalance } = compliance;
  const isMismatch = massBalance.status === "mass_balance_mismatch";
  const readiness = READINESS_CONFIG[compliance.readiness];
  const hasPlausibilityFlags = compliance.plausibility_flag_count > 0;

  const readinessDescription =
    compliance.readiness === "needs_review" && hasPlausibilityFlags && compliance.critical_farms === 0 && !isMismatch
      ? `${compliance.plausibility_flag_count} document${compliance.plausibility_flag_count === 1 ? "" : "s"} ` +
        `${compliance.plausibility_flag_count === 1 ? "has" : "have"} a sanity-check warning (see individual documents ` +
        `below) — an extracted value looked unusual enough to need a human look before this is treated as clean.`
      : readiness.description;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Mass Balance Check */}
      <Card
        className={cn(
          "transition-colors",
          isMismatch && "border-danger/40 bg-danger/[0.03]",
        )}
      >
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Scale className="size-4" aria-hidden="true" />
            Mass Balance Check
          </CardTitle>
          {isMismatch && <AlertTriangle className="size-4 text-danger" aria-hidden="true" />}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Declared weight</p>
              <p className="font-semibold text-foreground">
                {massBalance.declared_weight_kg.toLocaleString()} kg
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Extracted weight</p>
              <p className="font-semibold text-foreground">
                {massBalance.extracted_weight_kg.toLocaleString()} kg
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Difference</p>
              <p className={cn("font-semibold", isMismatch ? "text-danger" : "text-foreground")}>
                {massBalance.difference_kg > 0 ? "+" : ""}
                {massBalance.difference_kg.toLocaleString()} kg ({massBalance.percentage_difference}%)
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p
                key={massBalance.status}
                className={cn(
                  "animate-in fade-in font-semibold duration-300",
                  isMismatch ? "text-danger" : "text-success",
                )}
              >
                {isMismatch ? "Mismatch" : "Compliant"}
              </p>
            </div>
          </div>
          {isMismatch && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
              {massBalance.suggested_action}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Deforestation Risk */}
      <Card
        className={cn(
          "transition-colors",
          compliance.critical_farms > 0 && "border-danger/40 bg-danger/[0.03]",
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TreeDeciduous className="size-4" aria-hidden="true" />
            Deforestation Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Critical farms</p>
              <p
                key={compliance.critical_farms}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-1 font-semibold duration-300",
                  compliance.critical_farms > 0 ? "text-danger" : "text-foreground",
                )}
              >
                {compliance.critical_farms}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verified farms</p>
              <p className="font-semibold text-success">{compliance.verified_farms}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending verification</p>
              <p className="font-semibold text-warning">{compliance.pending_verification}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Percentage verified</p>
              <p className="font-semibold text-foreground">{compliance.percentage_verified}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance Readiness */}
      <Card
        className={cn(
          "transition-colors",
          readiness.tone === "danger" && "border-danger/40 bg-danger/[0.03]",
          readiness.tone === "warning" && "border-warning/40 bg-warning/[0.03]",
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Compliance Readiness
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            key={compliance.readiness}
            className="flex animate-in items-start gap-3 fade-in zoom-in-95 duration-300"
          >
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                readiness.tone === "success" && "bg-success/10",
                readiness.tone === "warning" && "bg-warning/10",
                readiness.tone === "danger" && "bg-danger/10",
              )}
            >
              <readiness.icon
                className={cn(
                  "size-5",
                  readiness.tone === "success" && "text-success",
                  readiness.tone === "warning" && "text-warning",
                  readiness.tone === "danger" && "text-danger",
                )}
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="font-semibold text-foreground">{readiness.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{readinessDescription}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
