import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "success" | "warning" | "danger";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: StatTone;
  hint?: string;
}

const ICON_WRAP: Record<StatTone, string> = {
  default: "bg-accent text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

/**
 * Compact KPI card shared across the operational pages (Suppliers,
 * Satellite Verification, Supply Chain, Document Review). Deliberately the
 * same visual language as the existing compliance overview cards so the
 * app reads as one product, not a patchwork of pages.
 */
export function StatCard({ label, value, icon: Icon, tone = "default", hint }: StatCardProps) {
  return (
    <Card className={cn(tone === "danger" && "border-danger/30")}>
      <CardContent className="p-4">
        <div className={cn("mb-3 flex size-9 items-center justify-center rounded-lg", ICON_WRAP[tone])}>
          <Icon className="size-4.5" aria-hidden="true" />
        </div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
      </CardContent>
    </Card>
  );
}
