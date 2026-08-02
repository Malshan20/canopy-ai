"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FileCode, ShieldCheck } from "lucide-react";

import { useComplianceQueue } from "@/hooks/use-compliance-queue";
import type { ComplianceQueueItem } from "@/hooks/use-compliance-queue";
import { approveShipmentExport } from "@/services/api";
import type { ComplianceReadiness, MassBalanceStatus } from "@/types/shipment";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const READINESS_META: Record<ComplianceReadiness, { label: string; badge: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready", badge: "success" },
  needs_review: { label: "Needs review", badge: "warning" },
  blocked: { label: "Blocked", badge: "danger" },
};

const MASS_BALANCE_META: Record<MassBalanceStatus, { label: string; badge: "success" | "danger" }> = {
  compliant: { label: "Compliant", badge: "success" },
  mass_balance_mismatch: { label: "Mismatch", badge: "danger" },
};

/**
 * The Compliance Center's actual review-and-sign-off workflow: every
 * shipment that isn't yet fully clear, with the real action a compliance
 * manager takes on it — approve for export (a real, audited sign-off via
 * `POST /shipments/{id}/export-approval`), then generate its XML once
 * both the automated checks and (if required) that sign-off are in place.
 * Nothing here is simulated: every status badge reflects a real backend
 * field, and "Approve for export" is the same endpoint & audit trail
 * entry the backend has supported all along — this table is what was
 * missing to actually use it.
 */
export function ComplianceQueueTable() {
  const { data, isLoading, isError, error, refetch } = useComplianceQueue();
  const [approving, setApproving] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) return <ErrorCard error={error} onRetry={() => refetch()} />;

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing needs your attention"
        description="Every shipment has passed its compliance checks and, where required, has an export sign-off recorded."
      />
    );
  }

  async function approve(item: ComplianceQueueItem) {
    setApproving(item.shipment.id);
    const result = await approveShipmentExport(item.shipment.id);
    setApproving(null);

    if (!result.ok) {
      toast.error("Could not approve this shipment", { description: result.error.message });
      return;
    }
    toast.success(`${item.shipment.source_filename ?? item.shipment.id} approved for export`, {
      description: "Recorded in the audit trail.",
    });
    setJustApproved((prev) => new Set(prev).add(item.shipment.id));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Shipment</TableHead>
            <TableHead>Readiness</TableHead>
            <TableHead>Mass balance</TableHead>
            <TableHead className="text-right">Critical farms</TableHead>
            <TableHead>Export sign-off</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const s = item.shipment;
            const readiness = s.readiness ? READINESS_META[s.readiness] : null;
            const massBalance = s.mass_balance_status ? MASS_BALANCE_META[s.mass_balance_status] : null;
            const isApproved = item.approval?.approved || justApproved.has(s.id);
            const needsSignOff = data!.requireExportApproval && !isApproved;
            const canGenerateXml = s.readiness === "ready" && !needsSignOff;

            return (
              <TableRow key={s.id}>
                <TableCell className="max-w-[240px]">
                  <p className="truncate font-medium text-foreground">{s.source_filename ?? s.id}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.commodity ?? "—"} · {s.country_of_production ?? "—"}
                  </p>
                </TableCell>
                <TableCell>
                  {readiness ? <Badge variant={readiness.badge}>{readiness.label}</Badge> : "—"}
                </TableCell>
                <TableCell>
                  {massBalance ? <Badge variant={massBalance.badge}>{massBalance.label}</Badge> : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span className={cn((s.critical_farms ?? 0) > 0 && "font-medium text-danger")}>
                    {s.critical_farms ?? 0}
                  </span>
                </TableCell>
                <TableCell>
                  {!data!.requireExportApproval ? (
                    <span className="text-xs text-muted-foreground">Not required</span>
                  ) : isApproved ? (
                    <span className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Approved
                    </span>
                  ) : (
                    <Badge variant="warning">Awaiting sign-off</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {needsSignOff && (
                      <Button size="sm" onClick={() => approve(item)} disabled={approving === s.id}>
                        {approving === s.id ? "Approving…" : "Approve for export"}
                      </Button>
                    )}
                    <Button asChild variant={canGenerateXml ? "outline" : "ghost"} size="sm">
                      <Link href={`/shipments/${s.id}`}>
                        {canGenerateXml ? (
                          <>
                            <FileCode />
                            Generate XML
                          </>
                        ) : (
                          <>
                            View
                            <ExternalLink />
                          </>
                        )}
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
