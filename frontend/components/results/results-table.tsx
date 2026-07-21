"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, FileSearch, ChevronLeft, ChevronRight, TriangleAlert, Flag } from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ResultsTableToolbar } from "@/components/results/results-table-toolbar";
import { DocumentStatusBadge, ConfidenceBadge, SatelliteVerificationBadge } from "@/components/results/status-badge";
import { RowActions } from "@/components/results/row-actions";
import { DocumentDetailDialog } from "@/components/results/document-detail-dialog";
import { FlagReviewDialog } from "@/components/results/flag-review-dialog";
import { SatelliteVerifyDialog } from "@/components/results/satellite-verify-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/utils";
import { fetchDocumentFlags } from "@/services/api";
import type { SatelliteVerificationResult } from "@/services/api";
import type { DocumentResult } from "@/types/shipment";
import { useShipmentStore } from "@/hooks/use-shipment-store";

const PAGE_SIZE = 8;

type SortKey =
  | "filename"
  | "classification"
  | "farmer"
  | "weight"
  | "date"
  | "confidence"
  | "satellite";
type SortDirection = "asc" | "desc";

interface ResultsTableProps {
  shipmentId: string;
  documents: DocumentResult[];
  isLoading?: boolean;
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  weighbridge_receipt: "Weighbridge receipt",
  land_deed: "Land deed",
  tax_id: "Tax ID",
  due_diligence_statement: "Due diligence statement",
  irrelevant: "Irrelevant",
};

const SATELLITE_RISK_RANK: Record<string, number> = {
  critical: 0,
  unknown: 1,
  low: 2,
};

/** The "who" column: a farmer name for receipts, falling back to the
 * supplier/operator name for document types (like a due diligence
 * statement) that don't have a farmer field at all. */
function displayName(doc: DocumentResult): string | null {
  return doc.extracted_data?.farmer_name ?? doc.extracted_data?.supplier_name ?? null;
}

function getSortValue(doc: DocumentResult, key: SortKey): string | number {
  switch (key) {
    case "filename":
      return doc.filename.toLowerCase();
    case "classification":
      return doc.classification;
    case "farmer":
      return displayName(doc)?.toLowerCase() ?? "";
    case "weight":
      return doc.extracted_data?.crop_weight_kg ?? -1;
    case "date":
      return doc.extracted_data?.date_of_transaction ?? "";
    case "confidence":
      return doc.extracted_data?.ai_confidence_score ?? -1;
    case "satellite":
      return doc.satellite_verification
        ? (SATELLITE_RISK_RANK[doc.satellite_verification.risk] ?? 3)
        : 3;
  }
}

function matchesQuery(doc: DocumentResult, query: string): boolean {
  const haystack = [
    doc.filename,
    doc.classification,
    doc.extracted_data?.farmer_name,
    doc.extracted_data?.receipt_number,
    doc.extracted_data?.supplier_name,
    doc.extracted_data?.village,
    doc.extracted_data?.operator_name,
    doc.extracted_data?.reference_number,
    doc.extracted_data?.product_name,
    doc.extracted_data?.hs_code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function ResultsTable({ shipmentId, documents, isLoading = false }: ResultsTableProps) {
  const { invalidate: invalidateStoredShipment } = useShipmentStore();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("filename");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [selectedDocument, setSelectedDocument] = useState<DocumentResult | null>(null);
  const [flagDialogDocument, setFlagDialogDocument] = useState<DocumentResult | null>(null);
  const [satelliteDialogDocument, setSatelliteDialogDocument] = useState<DocumentResult | null>(null);
  // Live re-checks (see SatelliteVerifyDialog's "Re-check GFW" button) only
  // ever updated the dialog's own local state — the table's Satellite
  // Verification column kept showing the stale processing-time result even
  // after a successful live re-check. This overlay is applied wherever
  // `documents` is used below so the column reflects the fresh result
  // immediately, without needing a full page reload.
  const [verificationOverrides, setVerificationOverrides] = useState<Record<string, SatelliteVerificationResult>>({});

  const { data: flags, refetch: refetchFlags } = useQuery({
    queryKey: ["document-flags", shipmentId],
    queryFn: async () => {
      const result = await fetchDocumentFlags(shipmentId);
      return result.ok ? result.data : [];
    },
  });
  const flaggedIds = useMemo(() => new Set((flags ?? []).map((f) => f.document_id)), [flags]);

  const mergedDocuments = useMemo(
    () =>
      documents.map((doc) => {
        const override = verificationOverrides[doc.document_id];
        return override ? { ...doc, satellite_verification: override } : doc;
      }),
    [documents, verificationOverrides],
  );

  const filtered = useMemo(
    () => mergedDocuments.filter((doc) => matchesQuery(doc, query)),
    [mergedDocuments, query],
  );

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);
      const comparison =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [filtered, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: "classification", label: "Document type" },
    { key: "farmer", label: "Farmer name" },
    { key: "weight", label: "Weight" },
    { key: "date", label: "Transaction date" },
    { key: "confidence", label: "AI confidence" },
  ];

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon={FileSearch}
          title="No documents found"
          description="This shipment didn't contain any recognizable receipts, deeds, or tax documents."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <ResultsTableToolbar
        query={query}
        onQueryChange={handleQueryChange}
        resultCount={sorted.length}
        totalCount={documents.length}
      />

      <div className="max-h-[520px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <SortableHeaderButton
                  label="Filename"
                  active={sortKey === "filename"}
                  direction={sortDirection}
                  onClick={() => toggleSort("filename")}
                />
              </TableHead>
              {columns.map((column) => (
                <TableHead key={column.key}>
                  <SortableHeaderButton
                    label={column.label}
                    active={sortKey === column.key}
                    direction={sortDirection}
                    onClick={() => toggleSort(column.key)}
                  />
                </TableHead>
              ))}
              <TableHead>GPS coordinates</TableHead>
              <TableHead>
                <SortableHeaderButton
                  label="Satellite Verification"
                  active={sortKey === "satellite"}
                  direction={sortDirection}
                  onClick={() => toggleSort("satellite")}
                />
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((doc) => (
              <TableRow key={doc.document_id}>
                <TableCell className="max-w-[220px] truncate font-medium text-foreground">
                  <span className="flex items-center gap-1.5">
                    {flaggedIds.has(doc.document_id) && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Flag className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Flagged for review" />
                        </TooltipTrigger>
                        <TooltipContent>Flagged for review</TooltipContent>
                      </Tooltip>
                    )}
                    <span className="truncate">{doc.filename}</span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {CLASSIFICATION_LABELS[doc.classification] ?? doc.classification}
                </TableCell>
                <TableCell>{displayName(doc) ?? "—"}</TableCell>
                <TableCell>
                  {doc.extracted_data?.crop_weight_kg
                    ? `${doc.extracted_data.crop_weight_kg.toLocaleString()} kg`
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(doc.extracted_data?.date_of_transaction)}</TableCell>
                <TableCell>
                  <ConfidenceBadge score={doc.extracted_data?.ai_confidence_score ?? null} />
                </TableCell>
                <TableCell className="max-w-[180px] truncate text-muted-foreground">
                  {doc.extracted_data?.gps_coordinates ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <SatelliteVerificationBadge verification={doc.satellite_verification} />
                    {doc.plausibility_flags.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger>
                          <TriangleAlert className="size-3.5 text-warning" aria-label="Sanity-check warning" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{doc.plausibility_flags[0]}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <DocumentStatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    document={doc}
                    shipmentId={shipmentId}
                    isFlagged={flaggedIds.has(doc.document_id)}
                    onView={setSelectedDocument}
                    onFlagRequested={setFlagDialogDocument}
                    onVerifySatellite={setSatelliteDialogDocument}
                    onFlagResolved={() => refetchFlags()}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <DocumentDetailDialog
        document={selectedDocument}
        onOpenChange={(open) => !open && setSelectedDocument(null)}
      />
      <FlagReviewDialog
        shipmentId={shipmentId}
        document={flagDialogDocument}
        onClose={() => setFlagDialogDocument(null)}
        onFlagged={() => refetchFlags()}
      />
      <SatelliteVerifyDialog
        shipmentId={shipmentId}
        document={satelliteDialogDocument}
        onClose={() => setSatelliteDialogDocument(null)}
        onVerified={(documentId, result) => {
          setVerificationOverrides((prev) => ({ ...prev, [documentId]: result }));
          // Without this, a reload would keep reading the sessionStorage
          // snapshot taken before this re-check — which is exactly why
          // the badge appeared to revert to "Pending Verification" after
          // a reload even though the backend had already persisted the
          // fresh result correctly. Clearing it here forces the next
          // load to actually ask the backend again.
          invalidateStoredShipment(shipmentId);
        }}
      />
    </div>
  );
}

function SortableHeaderButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <ArrowUpDown
        className={`size-3 transition-opacity ${
          active ? "opacity-100" : "opacity-30"
        } ${active && direction === "desc" ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );
}
