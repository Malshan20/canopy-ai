"use client";

import Link from "next/link";
import { FolderSearch, History, Hash, FileStack, ShieldCheck } from "lucide-react";

import { useShipmentDetail } from "@/hooks/use-shipment-detail";
import { summarizeShipment } from "@/lib/shipment-summary";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { SummaryCards, ComplianceCards } from "@/components/results/summary-cards";
import { ResultsTable } from "@/components/results/results-table";
import { DownloadXmlButton } from "@/components/results/download-xml-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ShipmentResultsViewProps {
  shipmentId: string;
}

const READINESS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  ready: { label: "Ready", variant: "success" },
  needs_review: { label: "Needs Review", variant: "warning" },
  blocked: { label: "Blocked", variant: "danger" },
};

export function ShipmentResultsView({ shipmentId }: ShipmentResultsViewProps) {
  const state = useShipmentDetail(shipmentId);

  if (state.status === "loading") {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === "not-found") {
    return (
      <PageContainer>
        <EmptyState
          icon={FolderSearch}
          title="Shipment not found"
          description="No shipment with this ID exists in your organization, or you don't have access to it."
          action={
            <Button asChild>
              <Link href="/shipments">Back to Shipments</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (state.status === "error") {
    return (
      <PageContainer>
        <ErrorCard error={state.error} />
      </PageContainer>
    );
  }

  const { result, source } = state;
  const summary = summarizeShipment(result.response.documents, result.processingTimeSeconds);
  const readiness = READINESS_CONFIG[result.response.compliance.readiness];

  return (
    <PageContainer>
      <PageHeader
        title="Shipment results"
        description={`${result.sourceFilename} · Shipment ID ${result.response.shipment_id}`}
        actions={
          <>
            <Badge variant="secondary">
              {source === "cache" ? "Analyzed this session" : "Loaded from your organization's records"}
            </Badge>
            <Button variant="outline" asChild>
              <Link href={`/shipments/${result.response.shipment_id}/audit-trail`}>
                <History />
                View Audit Trail
              </Link>
            </Button>
            <DownloadXmlButton
              shipmentId={result.response.shipment_id}
              disabled={result.response.compliance.readiness !== "ready"}
            />
          </>
        }
      />

      {/* Shipment Header: at-a-glance metadata for the compliance officer's workspace */}
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div className="flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-xs text-muted-foreground">{result.response.shipment_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <FileStack className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-foreground">
              {result.response.documents_processed} document{result.response.documents_processed === 1 ? "" : "s"} processed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            {readiness && <Badge variant={readiness.variant}>{readiness.label}</Badge>}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <SummaryCards summary={summary} />
        <ComplianceCards compliance={result.response.compliance} />
        <ResultsTable shipmentId={result.response.shipment_id} documents={result.response.documents} />
      </div>
    </PageContainer>
  );
}
