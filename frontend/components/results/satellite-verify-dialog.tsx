"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, Satellite, TriangleAlert } from "lucide-react";

import type { DocumentResult } from "@/types/shipment";
import { parseGpsCoordinateString } from "@/lib/gfw";
import { verifyDocumentSatellite } from "@/services/api";
import type { SatelliteVerificationResult } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlotMarker } from "@/components/satellite/plot-map";

const PlotMap = dynamic(() => import("@/components/satellite/plot-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

interface SatelliteVerifyDialogProps {
  shipmentId: string;
  document: DocumentResult | null;
  onClose: () => void;
  /** Fires after a successful live re-check, so the results table's
   * Satellite Verification column can reflect the fresh result immediately
   * instead of showing the stale processing-time value. */
  onVerified?: (documentId: string, result: SatelliteVerificationResult) => void;
}

interface RecheckState {
  loading: boolean;
  result?: SatelliteVerificationResult;
  error?: string;
}

const STATUS_META: Record<
  SatelliteVerificationResult["status"],
  { label: string; badge: "success" | "danger" | "warning" | "muted" }
> = {
  verified_clean: { label: "Verified clean", badge: "success" },
  forest_loss_detected: { label: "Forest loss detected", badge: "danger" },
  verification_pending: { label: "Verification pending", badge: "warning" },
  api_timeout: { label: "GFW check timed out", badge: "muted" },
  unknown: { label: "Unknown", badge: "muted" },
};

/**
 * Real satellite verification for a single document, opened from its row
 * action. Shows processing-time verification if the pipeline already
 * computed one, on a real Leaflet + GFW tile map, and a "Re-check GFW"
 * button that calls the backend's live verification endpoint — the exact
 * same `GeospatialService` the shipment pipeline itself uses, so results
 * here are always real, never simulated client-side.
 */
export function SatelliteVerifyDialog({ shipmentId, document, onClose, onVerified }: SatelliteVerifyDialogProps) {
  const [recheck, setRecheck] = useState<RecheckState | null>(null);

  const sv = document?.satellite_verification ?? null;
  const fallbackCoords = !sv ? parseGpsCoordinateString(document?.extracted_data?.gps_coordinates) : null;
  const latitude = recheck?.result?.latitude ?? sv?.latitude ?? fallbackCoords?.latitude ?? null;
  const longitude = recheck?.result?.longitude ?? sv?.longitude ?? fallbackCoords?.longitude ?? null;
  const latest = recheck?.result ?? sv;

  async function runRecheck() {
    if (!document || latitude === null || longitude === null) return;
    setRecheck({ loading: true });
    const result = await verifyDocumentSatellite(shipmentId, document.document_id, latitude, longitude);
    if (!result.ok) {
      setRecheck({ loading: false, error: result.error.message });
      return;
    }
    setRecheck({ loading: false, result: result.data });
    onVerified?.(document.document_id, result.data);
  }

  return (
    <Dialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) {
          setRecheck(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        {document && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Satellite className="size-4" aria-hidden="true" />
                Satellite verification
              </DialogTitle>
              <DialogDescription>{document.filename}</DialogDescription>
            </DialogHeader>

            {latitude === null || longitude === null ? (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  This document has no usable GPS coordinates — neither from processing-time satellite
                  verification nor from its extracted <code>gps_coordinates</code> field — so there&apos;s no
                  location to check against Global Forest Watch.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-72 overflow-hidden rounded-xl border border-border">
                  <PlotMap
                    markers={
                      [
                        {
                          id: document.document_id,
                          latitude,
                          longitude,
                          label: document.filename,
                          hasLoss: latest?.status === "forest_loss_detected",
                          pending: !latest || latest.status === "verification_pending" || latest.status === "api_timeout",
                        },
                      ] satisfies PlotMarker[]
                    }
                    activeId={document.document_id}
                  />
                </div>

                {latest ? (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">
                        {recheck?.result ? "Live re-check result" : "Processing-time verification"}
                      </span>
                      <Badge variant={STATUS_META[latest.status].badge}>{STATUS_META[latest.status].label}</Badge>
                    </div>
                    {latest.reason && <p className="mt-2 text-muted-foreground">{latest.reason}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {latitude.toFixed(4)}, {longitude.toFixed(4)} · cutoff {latest.cutoff_year} · loss years:{" "}
                      {latest.tree_cover_loss_years.length > 0 ? latest.tree_cover_loss_years.join(", ") : "none"}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No processing-time satellite verification was recorded for this document. Coordinates
                    below were parsed from its extracted <code>gps_coordinates</code> text — you can still
                    check them live against GFW.
                    <p className="mt-1 font-mono text-xs">
                      {latitude.toFixed(4)}, {longitude.toFixed(4)}
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Query Global Forest Watch live for this coordinate.</p>
                    <Button size="sm" variant="outline" onClick={runRecheck} disabled={recheck?.loading}>
                      <RefreshCw className={recheck?.loading ? "animate-spin" : ""} />
                      {recheck?.loading ? "Checking…" : "Re-check GFW"}
                    </Button>
                  </div>
                  {recheck?.error && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                      <p className="text-danger">Verification failed: {recheck.error}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
