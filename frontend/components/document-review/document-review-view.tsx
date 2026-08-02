"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ScanText, CheckCircle2, TriangleAlert, FileText, ExternalLink, Flag } from "lucide-react";

import { useOrgData } from "@/hooks/use-org-data";
import type { OrgDocument } from "@/hooks/use-org-data";
import type { ExtractedData } from "@/types/shipment";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Documents below this extraction confidence are surfaced for a human. */
const REVIEW_THRESHOLD = 0.85;

const FIELD_LABELS: Partial<Record<keyof ExtractedData, string>> = {
  farmer_name: "Farmer name",
  supplier_name: "Supplier",
  commodity: "Commodity",
  crop_weight_kg: "Crop weight (kg)",
  date_of_transaction: "Transaction date",
  gps_coordinates: "GPS coordinates",
  village: "Village",
  country: "Country",
  receipt_number: "Receipt no.",
  language_detected: "Language",
  operator_name: "Operator",
  hs_code: "HS code",
  product_name: "Product name",
  quantity_kg: "Quantity (kg)",
  reference_number: "Reference number",
  statement_date: "Statement date",
  deforestation_free_declared: "Deforestation-free declared",
  legal_compliance_conformity: "Legal compliance conformity",
  geolocation_evidence_present: "Geolocation evidence present",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  weighbridge_receipt: "Weighbridge receipt",
  land_deed: "Land deed",
  tax_id: "Tax ID",
  due_diligence_statement: "Due diligence statement",
  irrelevant: "Irrelevant",
};

type Filter = "needs_review" | "flagged" | "all";

interface ReviewItem extends OrgDocument {
  confidence: number;
  needsReview: boolean;
  flagged: boolean;
}

function toReviewItems(documents: OrgDocument[]): ReviewItem[] {
  return documents
    .filter((d) => d.doc.extracted_data !== null)
    .map((d) => {
      const confidence = d.doc.extracted_data?.ai_confidence_score ?? 0;
      const flagged = d.doc.plausibility_flags.length > 0;
      return {
        ...d,
        confidence,
        flagged,
        needsReview: flagged || confidence < REVIEW_THRESHOLD,
      };
    })
    .sort((a, b) => a.confidence - b.confidence);
}

export function DocumentReviewView() {
  const { data, isLoading, isError, error, refetch } = useOrgData();
  const [filter, setFilter] = useState<Filter>("needs_review");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => (data ? toReviewItems(data.documents) : []), [data]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "flagged") return items.filter((i) => i.flagged);
    return items.filter((i) => i.needsReview);
  }, [items, filter]);

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

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ScanText}
        title="No extracted documents yet"
        description="Once you process shipments, the documents the AI extracts fields from appear here — with the low-confidence and flagged ones prioritised for review."
      />
    );
  }

  const selected =
    (selectedId ? visible.find((i) => i.doc.document_id === selectedId) : undefined) ?? visible[0] ?? items[0];

  const totals = {
    total: items.length,
    needsReview: items.filter((i) => i.needsReview).length,
    flagged: items.filter((i) => i.flagged).length,
    avgConfidence:
      items.length > 0 ? items.reduce((sum, i) => sum + i.confidence, 0) / items.length : 0,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Documents extracted" value={totals.total.toString()} icon={FileText} />
        <StatCard
          label="Need review"
          value={totals.needsReview.toString()}
          icon={ScanText}
          tone={totals.needsReview > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Plausibility-flagged"
          value={totals.flagged.toString()}
          icon={Flag}
          tone={totals.flagged > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Avg. confidence"
          value={`${Math.round(totals.avgConfidence * 100)}%`}
          icon={CheckCircle2}
          tone={totals.avgConfidence >= REVIEW_THRESHOLD ? "success" : "warning"}
        />
      </div>

      <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {(["needs_review", "flagged", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "needs_review" ? "Needs review" : f === "flagged" ? "Flagged" : "All"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Nothing in this view — every document here cleared the confidence threshold.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-2">
            {visible.map((item) => {
              const isActive = item.doc.document_id === selected?.doc.document_id;
              return (
                <button
                  key={item.doc.document_id}
                  type="button"
                  onClick={() => setSelectedId(item.doc.document_id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    isActive ? "border-primary/40 bg-accent" : "border-border bg-card hover:bg-accent/40",
                  )}
                >
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.doc.filename}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.doc.extracted_data?.supplier_name ?? item.commodity ?? "—"} ·{" "}
                      {CLASSIFICATION_LABEL[item.doc.classification] ?? item.doc.classification}
                    </p>
                  </div>
                  <Badge variant={item.confidence < REVIEW_THRESHOLD ? "warning" : "success"}>
                    {Math.round(item.confidence * 100)}%
                  </Badge>
                </button>
              );
            })}
          </div>

          {selected && <ReviewDetail item={selected} />}
        </div>
      )}
    </div>
  );
}

function ReviewDetail({ item }: { item: ReviewItem }) {
  const ex = item.doc.extracted_data;
  const fields = ex
    ? (Object.keys(FIELD_LABELS) as (keyof ExtractedData)[])
        .filter((key) => ex[key] !== null && ex[key] !== undefined && ex[key] !== "")
        .map((key) => ({
          label: FIELD_LABELS[key]!,
          value: typeof ex[key] === "boolean" ? (ex[key] ? "Yes" : "No") : String(ex[key]),
        }))
    : [];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.doc.filename}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {CLASSIFICATION_LABEL[item.doc.classification] ?? item.doc.classification}
            {ex?.language_detected ? ` · ${ex.language_detected}` : ""} · {item.shipmentRef}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Extraction confidence</p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              item.confidence < REVIEW_THRESHOLD ? "text-warning" : "text-success",
            )}
          >
            {Math.round(item.confidence * 100)}%
          </p>
        </div>
      </div>

      {item.doc.plausibility_flags.length > 0 && (
        <div className="border-b border-border bg-warning/5 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            Plausibility flags
          </p>
          <ul className="mt-2 space-y-1">
            {item.doc.plausibility_flags.map((flag) => (
              <li key={flag} className="text-sm text-foreground">
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fields.length > 0 ? (
        <dl className="divide-y divide-border">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center gap-4 p-4">
              <dt className="w-40 shrink-0 text-xs text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="p-5 text-sm text-muted-foreground">No fields were extracted from this document.</p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          Confirm or reject this document from its shipment, where the sign-off is recorded.
        </p>
        <Button asChild variant="outline">
          <Link href={`/shipments/${item.shipmentId}`}>
            Open shipment
            <ExternalLink />
          </Link>
        </Button>
      </div>
    </div>
  );
}
