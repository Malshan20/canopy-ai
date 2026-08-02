"use client";

import { useMemo, useState } from "react";
import { Users, Search, MapPin, Leaf, TriangleAlert, ShieldCheck } from "lucide-react";

import { useOrgData } from "@/hooks/use-org-data";
import type { OrgDocument } from "@/hooks/use-org-data";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Risk = "low" | "medium" | "critical";

interface SupplierAgg {
  name: string;
  countries: string[];
  commodities: string[];
  documents: number;
  plotsClean: number;
  plotsLoss: number;
  plotsPending: number;
  avgConfidence: number | null;
  volumeKg: number;
  lastActivity: string;
  risk: Risk;
}

const RISK_BADGE: Record<Risk, { variant: "success" | "warning" | "danger"; label: string }> = {
  low: { variant: "success", label: "Low risk" },
  medium: { variant: "warning", label: "Medium risk" },
  critical: { variant: "danger", label: "Critical" },
};

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function aggregate(documents: OrgDocument[]): SupplierAgg[] {
  const groups = new Map<string, OrgDocument[]>();
  for (const d of documents) {
    const name = d.doc.extracted_data?.supplier_name?.trim() || "Unattributed supplier";
    const list = groups.get(name) ?? [];
    list.push(d);
    groups.set(name, list);
  }

  const suppliers: SupplierAgg[] = [];
  for (const [name, docs] of groups) {
    const countries = new Set<string>();
    const commodities = new Set<string>();
    let plotsClean = 0;
    let plotsLoss = 0;
    let plotsPending = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;
    let volumeKg = 0;
    let lastActivity = "";

    for (const { doc, commodity, country, createdAt } of docs) {
      const ex = doc.extracted_data;
      const c = ex?.country ?? country;
      const cm = ex?.commodity ?? commodity;
      if (c) countries.add(c);
      if (cm) commodities.add(cm);
      if (ex && typeof ex.ai_confidence_score === "number") {
        confidenceSum += ex.ai_confidence_score;
        confidenceCount += 1;
      }
      if (ex?.crop_weight_kg) volumeKg += ex.crop_weight_kg;
      if (createdAt > lastActivity) lastActivity = createdAt;

      const sv = doc.satellite_verification;
      if (sv) {
        if (sv.status === "verified_clean") plotsClean += 1;
        else if (sv.status === "forest_loss_detected") plotsLoss += 1;
        else plotsPending += 1;
      }
    }

    const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : null;
    const risk: Risk =
      plotsLoss > 0
        ? "critical"
        : plotsPending > 0 || (avgConfidence !== null && avgConfidence < 0.85)
          ? "medium"
          : "low";

    suppliers.push({
      name,
      countries: [...countries],
      commodities: [...commodities],
      documents: docs.length,
      plotsClean,
      plotsLoss,
      plotsPending,
      avgConfidence,
      volumeKg,
      lastActivity,
      risk,
    });
  }

  return suppliers.sort((a, b) => b.documents - a.documents);
}

export function SuppliersView() {
  const { data, isLoading, isError, error, refetch } = useOrgData();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selected, setSelected] = useState<SupplierAgg | null>(null);

  const suppliers = useMemo(() => (data ? aggregate(data.documents) : []), [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const matchesSearch =
        term === "" ||
        s.name.toLowerCase().includes(term) ||
        s.countries.some((c) => c.toLowerCase().includes(term)) ||
        s.commodities.some((c) => c.toLowerCase().includes(term));
      const matchesRisk = riskFilter === "all" || s.risk === riskFilter;
      return matchesSearch && matchesRisk;
    });
  }, [suppliers, search, riskFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (isError) return <ErrorCard error={error} onRetry={() => refetch()} />;

  if (suppliers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No suppliers yet"
        description="Suppliers are built from the documents you process. Upload a shipment and the suppliers named in its documents appear here."
      />
    );
  }

  const totals = {
    count: suppliers.length,
    critical: suppliers.filter((s) => s.risk === "critical").length,
    plots: suppliers.reduce((sum, s) => sum + s.plotsClean + s.plotsLoss + s.plotsPending, 0),
    cleanShare: (() => {
      const total = suppliers.reduce((sum, s) => sum + s.plotsClean + s.plotsLoss + s.plotsPending, 0);
      const clean = suppliers.reduce((sum, s) => sum + s.plotsClean, 0);
      return total > 0 ? clean / total : null;
    })(),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Suppliers" value={totals.count.toString()} icon={Users} />
        <StatCard
          label="Critical-risk suppliers"
          value={totals.critical.toString()}
          icon={TriangleAlert}
          tone={totals.critical > 0 ? "danger" : "success"}
        />
        <StatCard label="Plots checked" value={totals.plots.toString()} icon={Leaf} />
        <StatCard
          label="Plots clean"
          value={pct(totals.cleanShare)}
          icon={ShieldCheck}
          tone={totals.cleanShare !== null && totals.cleanShare > 0.85 ? "success" : "warning"}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, country, or commodity…"
            aria-label="Search suppliers by name, country, or commodity"
            className="pl-9"
          />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All risk levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk levels</SelectItem>
            <SelectItem value="low">Low risk</SelectItem>
            <SelectItem value="medium">Medium risk</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Commodities</TableHead>
              <TableHead className="text-right">Documents</TableHead>
              <TableHead className="text-right">Avg. confidence</TableHead>
              <TableHead>Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No suppliers match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((supplier) => (
                <TableRow key={supplier.name} onClick={() => setSelected(supplier)} className="cursor-pointer">
                  <TableCell className="font-medium text-foreground">{supplier.name}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {supplier.countries.join(", ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {supplier.commodities.join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{supplier.documents}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(supplier.avgConfidence)}</TableCell>
                  <TableCell>
                    <Badge variant={RISK_BADGE[supplier.risk].variant}>
                      {RISK_BADGE[supplier.risk].label}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierDrawer supplier={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: SupplierAgg | null; onClose: () => void }) {
  return (
    <Dialog open={supplier !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {supplier && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>{supplier.name}</DialogTitle>
                <Badge variant={RISK_BADGE[supplier.risk].variant}>{RISK_BADGE[supplier.risk].label}</Badge>
              </div>
              <DialogDescription>
                {supplier.countries.join(", ") || "Origin unknown"} ·{" "}
                {supplier.commodities.join(", ") || "—"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-2">
              <DrawerStat label="Documents processed" value={supplier.documents.toString()} />
              <DrawerStat label="Volume (from receipts)" value={`${Math.round(supplier.volumeKg).toLocaleString()} kg`} />
              <DrawerStat label="Plots clean" value={supplier.plotsClean.toString()} valueClassName="text-success" />
              <DrawerStat
                label="Plots with loss"
                value={supplier.plotsLoss.toString()}
                valueClassName={supplier.plotsLoss > 0 ? "text-danger" : undefined}
              />
              <DrawerStat label="Plots pending" value={supplier.plotsPending.toString()} />
              <DrawerStat label="Avg. confidence" value={pct(supplier.avgConfidence)} />
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
              Aggregated live from processed shipment documents. Last activity{" "}
              {supplier.lastActivity ? new Date(supplier.lastActivity).toLocaleDateString() : "—"}.
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DrawerStat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums text-foreground", valueClassName)}>{value}</p>
    </div>
  );
}
