"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Satellite, ShieldCheck, TriangleAlert, Clock, Search, RefreshCw } from "lucide-react";

import { useOrgData } from "@/hooks/use-org-data";
import { verifyDocumentSatellite } from "@/services/api";
import type { SatelliteVerificationResult as LiveSatelliteResult } from "@/services/api";
import type {
  SatelliteVerificationStatus,
  SatelliteRisk,
} from "@/types/shipment";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlotMarker } from "@/components/satellite/plot-map";
import { cn } from "@/lib/utils";

const PlotMap = dynamic(() => import("@/components/satellite/plot-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface RealPlot {
  id: string;
  shipmentId: string;
  documentId: string;
  code: string;
  supplierName: string;
  commodity: string;
  country: string;
  latitude: number;
  longitude: number;
  status: SatelliteVerificationStatus;
  risk: SatelliteRisk;
  treeCoverLossYears: number[];
  cutoffYear: number;
  reason: string | null;
}

const STATUS_META: Record<
  SatelliteVerificationStatus,
  { label: string; badge: "success" | "danger" | "warning" | "muted"; dot: string }
> = {
  verified_clean: { label: "Verified clean", badge: "success", dot: "bg-success" },
  forest_loss_detected: { label: "Forest loss", badge: "danger", dot: "bg-danger" },
  verification_pending: { label: "Pending", badge: "warning", dot: "bg-warning" },
  api_timeout: { label: "Check timed out", badge: "muted", dot: "bg-muted-foreground" },
  unknown: { label: "Unknown", badge: "muted", dot: "bg-muted-foreground" },
};

interface RecheckState {
  loading: boolean;
  result?: LiveSatelliteResult;
  error?: string;
}

export function SatelliteView() {
  const { data, isLoading, isError, error, refetch } = useOrgData();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rechecks, setRechecks] = useState<Record<string, RecheckState>>({});

  const plots = useMemo<RealPlot[]>(() => {
    if (!data) return [];
    return data.documents
      .filter((d) => d.doc.satellite_verification !== null)
      .map((d) => {
        const sv = d.doc.satellite_verification!;
        const ex = d.doc.extracted_data;
        return {
          id: d.doc.document_id,
          shipmentId: d.shipmentId,
          documentId: d.doc.document_id,
          code: d.doc.filename,
          supplierName: ex?.supplier_name ?? ex?.farmer_name ?? d.shipmentRef,
          commodity: ex?.commodity ?? d.commodity ?? "—",
          country: ex?.country ?? d.country ?? "—",
          latitude: sv.latitude,
          longitude: sv.longitude,
          status: sv.status,
          risk: sv.risk,
          treeCoverLossYears: sv.tree_cover_loss_years,
          cutoffYear: sv.cutoff_year,
          reason: sv.reason,
        };
      });
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return plots;
    return plots.filter(
      (p) =>
        p.code.toLowerCase().includes(term) ||
        p.supplierName.toLowerCase().includes(term) ||
        p.country.toLowerCase().includes(term),
    );
  }, [plots, search]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[28rem] rounded-xl" />
      </div>
    );
  }

  if (isError) return <ErrorCard error={error} onRetry={() => refetch()} />;

  if (plots.length === 0) {
    return (
      <EmptyState
        icon={Satellite}
        title="No verified plots yet"
        description="Once you process shipments containing GPS coordinates, each plot's satellite verification against Global Forest Watch appears here."
      />
    );
  }

  const defaultPlot = plots.find((p) => p.status === "forest_loss_detected") ?? plots[0];
  const selected = (selectedId ? plots.find((p) => p.id === selectedId) : undefined) ?? defaultPlot;
  if (!selected) return null;

  const markers: PlotMarker[] = plots.map((p) => ({
    id: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    label: `${p.code} · ${STATUS_META[p.status].label}`,
    hasLoss: p.status === "forest_loss_detected",
    pending: p.status === "verification_pending" || p.status === "api_timeout",
  }));

  const totals = {
    total: plots.length,
    clean: plots.filter((p) => p.status === "verified_clean").length,
    loss: plots.filter((p) => p.status === "forest_loss_detected").length,
    pending: plots.filter((p) => p.status === "verification_pending" || p.status === "api_timeout").length,
  };

  async function recheck(plot: RealPlot) {
    setRechecks((prev) => ({ ...prev, [plot.id]: { loading: true } }));
    const result = await verifyDocumentSatellite(plot.shipmentId, plot.documentId, plot.latitude, plot.longitude);
    if (!result.ok) {
      setRechecks((prev) => ({ ...prev, [plot.id]: { loading: false, error: result.error.message } }));
      return;
    }
    setRechecks((prev) => ({ ...prev, [plot.id]: { loading: false, result: result.data } }));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Plots monitored" value={totals.total.toString()} icon={Satellite} />
        <StatCard label="Verified clean" value={totals.clean.toString()} icon={ShieldCheck} tone="success" />
        <StatCard
          label="Forest loss detected"
          value={totals.loss.toString()}
          icon={TriangleAlert}
          tone={totals.loss > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Pending / timed out"
          value={totals.pending.toString()}
          icon={Clock}
          tone={totals.pending > 0 ? "warning" : "default"}
        />
      </div>

      {/* Real map */}
      <div className="h-[26rem] overflow-hidden rounded-xl border border-border">
        <PlotMap markers={markers} activeId={selected.id} onSelect={setSelectedId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plots, suppliers, countries…"
              aria-label="Search plots, suppliers, and countries"
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                No plots match your search.
              </p>
            ) : (
              filtered.map((plot) => {
                const meta = STATUS_META[plot.status];
                const isActive = plot.id === selected.id;
                return (
                  <button
                    key={plot.id}
                    type="button"
                    onClick={() => setSelectedId(plot.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      isActive
                        ? "border-primary/40 bg-accent"
                        : "border-border bg-card hover:border-primary/20 hover:bg-accent/40",
                    )}
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{plot.code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {plot.supplierName} · {plot.commodity}
                      </p>
                    </div>
                    <Badge variant={meta.badge}>{meta.label}</Badge>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <VerdictPanel plot={selected} recheck={rechecks[selected.id]} onRecheck={() => recheck(selected)} />
      </div>
    </div>
  );
}

function VerdictPanel({
  plot,
  recheck,
  onRecheck,
}: {
  plot: RealPlot;
  recheck?: RecheckState;
  onRecheck: () => void;
}) {
  const meta = STATUS_META[plot.status];
  const postCutoff = plot.treeCoverLossYears.filter((y) => y > plot.cutoffYear);
  const preCutoff = plot.treeCoverLossYears.filter((y) => y <= plot.cutoffYear);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{plot.supplierName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {plot.commodity} · {plot.country} · {plot.latitude.toFixed(4)}, {plot.longitude.toFixed(4)}
          </p>
        </div>
        <Badge variant={meta.badge}>{meta.label}</Badge>
      </div>

      {plot.reason && (
        <p
          className={cn(
            "mt-4 rounded-lg border p-3 text-sm leading-relaxed",
            plot.status === "forest_loss_detected"
              ? "border-danger/20 bg-danger/5 text-foreground"
              : plot.status === "verification_pending"
                ? "border-warning/20 bg-warning/5 text-foreground"
                : "border-border bg-muted/40 text-foreground",
          )}
        >
          {plot.reason}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Loss after cutoff ({plot.cutoffYear})</dt>
          <dd className={cn("mt-0.5 font-medium tabular-nums", postCutoff.length ? "text-danger" : "text-success")}>
            {postCutoff.length ? postCutoff.join(", ") : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Loss before cutoff</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-muted-foreground">
            {preCutoff.length ? `${preCutoff.join(", ")} (exempt)` : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Risk</dt>
          <dd
            className={cn(
              "mt-0.5 font-medium capitalize",
              plot.risk === "critical" ? "text-danger" : plot.risk === "low" ? "text-success" : "text-muted-foreground",
            )}
          >
            {plot.risk}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Data source</dt>
          <dd className="mt-0.5 font-medium text-foreground">Global Forest Watch</dd>
        </div>
      </dl>

      {/* Live GFW re-check */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Re-query Global Forest Watch live for this coordinate.
          </p>
          <Button size="sm" variant="outline" onClick={onRecheck} disabled={recheck?.loading}>
            <RefreshCw className={recheck?.loading ? "animate-spin" : ""} />
            {recheck?.loading ? "Checking…" : "Re-check GFW"}
          </Button>
        </div>

        {recheck && !recheck.loading && (
          <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {recheck.error ? (
              <p className="text-danger">Verification failed: {recheck.error}</p>
            ) : recheck.result ? (
              recheck.result.status === "verified_clean" || recheck.result.status === "forest_loss_detected" ? (
                <>
                  <p className="text-foreground">
                    {recheck.result.tree_cover_loss_years.length > 0 ? (
                      <>
                        Loss years returned:{" "}
                        <span className="font-medium tabular-nums">
                          {recheck.result.tree_cover_loss_years.join(", ")}
                        </span>
                      </>
                    ) : (
                      "GFW returned no tree-cover loss for this coordinate."
                    )}
                  </p>
                  {recheck.result.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">{recheck.result.reason}</p>
                  )}
                </>
              ) : (
                // Inconclusive (pending / timed out / unknown) — do NOT
                // present that as "no loss found"; for a compliance tool
                // that distinction is the whole product.
                <p className="text-warning">
                  Verification inconclusive
                  {recheck.result.reason ? ` — ${recheck.result.reason}` : "."}
                </p>
              )
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
