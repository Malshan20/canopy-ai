import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ShieldAlert, Scale, Satellite, FileCode } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ComplianceOverview } from "@/types/organization";

interface CardConfig {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "default" | "warning" | "danger";
}

export function ComplianceOverviewCards({ overview }: { overview: ComplianceOverview }) {
  const cards: CardConfig[] = [
    {
      label: "Shipments requiring review",
      value: overview.shipments_requiring_review.toString(),
      icon: AlertTriangle,
      tone: overview.shipments_requiring_review > 0 ? "warning" : "default",
    },
    {
      label: "Critical alerts",
      value: overview.critical_alerts.toString(),
      icon: ShieldAlert,
      tone: overview.critical_alerts > 0 ? "danger" : "default",
    },
    {
      label: "Mass balance failures",
      value: overview.mass_balance_failures.toString(),
      icon: Scale,
      tone: overview.mass_balance_failures > 0 ? "danger" : "default",
    },
    {
      label: "Satellite check failures",
      value: overview.satellite_failures.toString(),
      icon: Satellite,
      tone: overview.satellite_failures > 0 ? "warning" : "default",
    },
    {
      label: "DDS XML documents generated",
      value: overview.xml_generated_count.toString(),
      icon: FileCode,
      tone: "default",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className={cn(card.tone === "danger" && "border-danger/30")}>
          <CardContent className="p-4">
            <div
              className={cn(
                "mb-3 flex size-9 items-center justify-center rounded-lg",
                card.tone === "warning" && "bg-warning/10",
                card.tone === "danger" && "bg-danger/10",
                card.tone === "default" && "bg-accent",
              )}
            >
              <card.icon
                className={cn(
                  "size-4.5",
                  card.tone === "warning" && "text-warning",
                  card.tone === "danger" && "text-danger",
                  card.tone === "default" && "text-primary",
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
