"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, ChevronLeft, ChevronRight } from "lucide-react";

import { useShipmentsList } from "@/hooks/use-shipments-list";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const PAGE_SIZE = 20;

const READINESS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready", variant: "success" },
  needs_review: { label: "Needs Review", variant: "warning" },
  blocked: { label: "Blocked", variant: "danger" },
};

/**
 * The Shipments list — polls `GET /api/v1/shipments` every 15s while the
 * tab is focused (see `hooks/use-shipments-list.ts`) so new uploads from
 * teammates appear without a manual refresh. Every row is real backend
 * data; there is no "Supplier Count" column because CanoryAI doesn't
 * persist a distinct supplier entity yet (see the backend schema's
 * docstring) — showing `documents_processed` instead of a fabricated
 * supplier count.
 */
export function ShipmentsDataTable() {
  const [page, setPage] = useState(1);
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useShipmentsList(page, PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <ErrorCard error={error!} onRetry={() => refetch()} />;
  }

  if (!data || data.shipments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon={Package}
          title="No shipments yet"
          description="Upload a ZIP archive of supplier documents to see your shipment history here."
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="max-h-[640px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Shipment</TableHead>
              <TableHead>Commodity</TableHead>
              <TableHead>Country of Origin</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead>Deforestation Risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.shipments.map((shipment) => (
              <TableRow
                key={shipment.id}
                className="cursor-pointer"
                onClick={() => router.push(`/shipments/${shipment.id}`)}
                tabIndex={0}
                role="link"
                aria-label={`View shipment ${shipment.source_filename ?? shipment.id}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/shipments/${shipment.id}`);
                }}
              >
                <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                  {shipment.source_filename ?? shipment.id}
                </TableCell>
                <TableCell className="text-muted-foreground">{shipment.commodity ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {shipment.country_of_production ?? "—"}
                </TableCell>
                <TableCell>{shipment.documents_processed ?? "—"}</TableCell>
                <TableCell>
                  {shipment.critical_farms !== null ? (
                    <Badge variant={shipment.critical_farms > 0 ? "danger" : "success"}>
                      {shipment.critical_farms > 0
                        ? `${shipment.critical_farms} critical`
                        : "Clear"}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {shipment.readiness ? (
                    <Badge variant={READINESS_CONFIG[shipment.readiness]?.variant ?? "muted"}>
                      {READINESS_CONFIG[shipment.readiness]?.label ?? shipment.readiness}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(shipment.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Page {page} of {totalPages} · {data.total} shipment{data.total === 1 ? "" : "s"}
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
