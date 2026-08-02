"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  DocumentStatusBadge,
  ConfidenceBadge,
  SatelliteVerificationBadge,
} from "@/components/results/status-badge";
import { formatDate } from "@/lib/utils";
import type { DocumentResult } from "@/types/shipment";

interface DocumentDetailDialogProps {
  document: DocumentResult | null;
  onOpenChange: (open: boolean) => void;
}

const FIELD_LABELS: Record<string, string> = {
  farmer_name: "Farmer name",
  crop_weight_kg: "Crop weight (kg)",
  date_of_transaction: "Transaction date",
  gps_coordinates: "GPS coordinates",
  supplier_name: "Supplier name",
  village: "Village",
  commodity: "Commodity",
  receipt_number: "Receipt number",
  country: "Country",
  language_detected: "Language detected",
  document_notes: "Notes",
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

const DATE_FIELDS = new Set(["date_of_transaction", "statement_date"]);
const BOOLEAN_FIELDS = new Set([
  "deforestation_free_declared",
  "legal_compliance_conformity",
  "geolocation_evidence_present",
]);

export function DocumentDetailDialog({ document, onOpenChange }: DocumentDetailDialogProps) {
  const data = document?.extracted_data;

  return (
    <Dialog open={document !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {document && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate">{document.filename}</DialogTitle>
              <DialogDescription>
                Document ID: <span className="font-mono">{document.document_id}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <DocumentStatusBadge status={document.status} />
              {data && <ConfidenceBadge score={data.ai_confidence_score} />}
              {document.satellite_verification && (
                <SatelliteVerificationBadge verification={document.satellite_verification} />
              )}
            </div>

            {document.error_detail && (
              <p className="rounded-md bg-danger/5 px-3 py-2 text-sm text-danger">
                {document.error_detail}
              </p>
            )}

            {document.satellite_verification?.reason && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {document.satellite_verification.reason}
              </p>
            )}

            {document.plausibility_flags.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
                <p className="text-xs font-medium text-warning">Sanity-check warning</p>
                {document.plausibility_flags.map((flag) => (
                  <p key={flag} className="text-sm text-foreground">
                    {flag}
                  </p>
                ))}
              </div>
            )}

            {data ? (
              <>
                <Separator />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
                    .filter((key) => {
                      const value = data[key as keyof typeof data];
                      return value !== null && value !== undefined && value !== "";
                    })
                    .map((key) => {
                      const rawValue = data[key as keyof typeof data];
                      const displayValue = DATE_FIELDS.has(key)
                        ? formatDate(rawValue as string | null)
                        : BOOLEAN_FIELDS.has(key)
                          ? rawValue
                            ? "Yes"
                            : "No"
                          : rawValue;
                      return (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground">{FIELD_LABELS[key]}</dt>
                          <dd className="mt-0.5 truncate font-medium text-foreground">
                            {String(displayValue)}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No structured data was extracted for this document.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
