"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Waypoints,
  CheckCircle2,
  TriangleAlert,
  CircleDashed,
  ChevronDown,
  Sprout,
  ScanText,
  Scale,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useOrgData } from "@/hooks/use-org-data";
import type { OrgShipmentDetail } from "@/hooks/use-org-data";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type NodeStatus = "verified" | "attention" | "unverified";

interface ChainStage {
  key: string;
  label: string;
  icon: LucideIcon;
  status: NodeStatus;
  detail: string;
}

const STATUS_META: Record<
  NodeStatus,
  { ring: string; text: string; icon: LucideIcon; badge: "success" | "warning" | "danger" }
> = {
  verified: { ring: "border-success bg-success/10", text: "text-success", icon: CheckCircle2, badge: "success" },
  attention: { ring: "border-warning bg-warning/10", text: "text-warning", icon: TriangleAlert, badge: "warning" },
  unverified: { ring: "border-border bg-muted", text: "text-muted-foreground", icon: CircleDashed, badge: "danger" },
};

function buildStages(entry: OrgShipmentDetail): ChainStage[] {
  const c = entry.compliance;
  const mb = c.mass_balance;

  const originStatus: NodeStatus =
    c.critical_farms > 0 ? "unverified" : c.pending_verification > 0 ? "attention" : "verified";

  const extractionStatus: NodeStatus = c.plausibility_flag_count > 0 ? "attention" : "verified";

  const massStatus: NodeStatus =
    mb.status === "compliant" ? "verified" : mb.severity === "critical" ? "unverified" : "attention";

  const readinessStatus: NodeStatus =
    c.readiness === "ready" ? "verified" : c.readiness === "needs_review" ? "attention" : "unverified";

  return [
    {
      key: "origin",
      label: "Origin plots",
      icon: Sprout,
      status: originStatus,
      detail: `${c.verified_farms} verified · ${c.critical_farms} with loss · ${c.pending_verification} pending (${c.total_coordinates_checked} coordinates checked)`,
    },
    {
      key: "extraction",
      label: "Extraction",
      icon: ScanText,
      status: extractionStatus,
      detail: `${entry.documents.length} documents processed · ${c.plausibility_flag_count} plausibility flag${c.plausibility_flag_count === 1 ? "" : "s"}`,
    },
    {
      key: "mass_balance",
      label: "Mass balance",
      icon: Scale,
      status: massStatus,
      detail:
        mb.status === "compliant"
          ? `Reconciled within tolerance (${mb.percentage_difference.toFixed(1)}% vs ${mb.tolerance_percentage}%)`
          : `${mb.difference_kg.toLocaleString()} kg gap (${mb.percentage_difference.toFixed(1)}%) — ${mb.suggested_action}`,
    },
    {
      key: "compliance",
      label: "Compliance",
      icon: ShieldCheck,
      status: readinessStatus,
      detail:
        c.readiness === "ready"
          ? "Ready for a due diligence statement"
          : c.readiness === "needs_review"
            ? "Needs review before a statement can be issued"
            : "Blocked — unresolved critical issues",
    },
  ];
}

export function SupplyChainView() {
  const { data, isLoading, isError, error, refetch } = useOrgData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) return <ErrorCard error={error} onRetry={() => refetch()} />;

  const shipments = data?.shipments ?? [];

  if (shipments.length === 0) {
    return (
      <EmptyState
        icon={Waypoints}
        title="No traceability chains yet"
        description="Each shipment you process builds a chain of custody — from origin plots through extraction and mass balance to compliance readiness. Process a shipment to see it here."
      />
    );
  }

  const totals = {
    chains: shipments.length,
    ready: shipments.filter((s) => s.compliance.readiness === "ready").length,
    blocked: shipments.filter((s) => s.compliance.readiness === "blocked").length,
    volume: shipments.reduce((sum, s) => sum + (s.shipment.declared_weight_kg ?? 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Chains" value={totals.chains.toString()} icon={Waypoints} />
        <StatCard label="Ready for DDS" value={totals.ready.toString()} icon={CheckCircle2} tone="success" />
        <StatCard
          label="Blocked"
          value={totals.blocked.toString()}
          icon={TriangleAlert}
          tone={totals.blocked > 0 ? "danger" : "success"}
        />
        <StatCard label="Volume declared" value={`${Math.round(totals.volume).toLocaleString()} kg`} icon={Scale} />
      </div>

      <div className="space-y-4">
        {shipments.map((entry) => (
          <ChainCard key={entry.shipment.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ChainCard({ entry }: { entry: OrgShipmentDetail }) {
  const [expanded, setExpanded] = useState(false);
  const stages = buildStages(entry);
  const s = entry.shipment;
  const completePct = Math.round(entry.compliance.percentage_verified);
  const hasIssue = stages.some((stage) => stage.status !== "verified");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {s.source_filename ?? s.id}
            </p>
            <Badge variant={hasIssue ? "warning" : "success"}>
              {hasIssue ? "Attention needed" : "Fully traceable"}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {s.commodity ?? "—"} · {s.country_of_production ?? "—"} ·{" "}
            {(s.declared_weight_kg ?? 0).toLocaleString()} kg · {new Date(s.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Coordinates verified</p>
          <p className={cn("text-lg font-semibold tabular-nums", completePct >= 99 ? "text-success" : "text-warning")}>
            {completePct}%
          </p>
        </div>
      </div>

      <div className="overflow-x-auto px-5 pb-5">
        <div className="flex min-w-max items-start gap-0">
          {stages.map((stage, index) => {
            const meta = STATUS_META[stage.status];
            const isLast = index === stages.length - 1;
            return (
              <div key={stage.key} className="flex items-start">
                <div className="flex w-36 flex-col items-center text-center">
                  <div className={cn("flex size-11 items-center justify-center rounded-full border-2", meta.ring)}>
                    <stage.icon className={cn("size-5", meta.text)} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-xs font-medium text-foreground">{stage.label}</p>
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      "mt-[22px] h-0.5 w-8 shrink-0",
                      stage.status === "verified" && stages[index + 1]?.status === "verified"
                        ? "bg-success"
                        : "bg-border",
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        {expanded ? "Hide" : "Show"} stage detail
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="divide-y divide-border border-t border-border">
          {stages.map((stage) => {
            const meta = STATUS_META[stage.status];
            return (
              <div key={stage.key} className="flex items-start gap-3 p-4">
                <meta.icon className={cn("mt-0.5 size-4 shrink-0", meta.text)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{stage.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{stage.detail}</p>
                </div>
                <Badge variant={meta.badge} className="capitalize">
                  {stage.status}
                </Badge>
              </div>
            );
          })}
          <div className="flex items-center justify-end p-4">
            <Button asChild variant="outline" size="sm">
              <Link href={`/shipments/${s.id}`}>
                Open shipment
                <ExternalLink />
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
