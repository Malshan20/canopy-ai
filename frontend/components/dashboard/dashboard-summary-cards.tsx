import type { LucideIcon } from "lucide-react";
import { FileStack, FileSearch, Gauge, ShieldCheck, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatConfidence } from "@/lib/utils";
import type { DashboardSummary } from "@/types/organization";

interface CardConfig {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "danger";
}

/**
 * "Active Suppliers" is deliberately not shown here — CanoryAI doesn't
 * persist a distinct supplier entity anywhere yet (see
 * `backend/app/schemas/shipment_summary.py`'s `DashboardSummary`
 * docstring), so a number for it would have to be fabricated. Showing five
 * real metrics is more trustworthy than six where one is invented.
 */
export function DashboardSummaryCards({ summary }: { summary: DashboardSummary }) {
  const complianceScore =
    summary.total_shipments > 0
      ? Math.round((summary.compliance_ready_count / summary.total_shipments) * 100)
      : null;

  const cards: CardConfig[] = [
    { label: "Total shipments", value: summary.total_shipments.toString(), icon: FileStack },
    { label: "Documents processed", value: summary.documents_processed.toString(), icon: FileSearch },
    {
      label: "Average AI confidence",
      value: summary.average_confidence !== null ? formatConfidence(summary.average_confidence) : "—",
      icon: Gauge,
    },
    {
      label: "Overall compliance score",
      value: complianceScore !== null ? `${complianceScore}%` : "—",
      icon: ShieldCheck,
      tone: complianceScore !== null && complianceScore < 70 ? "warning" : "default",
    },
    {
      label: "Critical risk count",
      value: summary.critical_risk_count.toString(),
      icon: ShieldAlert,
      tone: summary.critical_risk_count > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
            <p className="text-2xl font-semibold tracking-tight text-foreground">{card.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
