"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { useAuditTrail } from "@/hooks/use-audit-trail";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorCard } from "@/components/shared/error-card";
import { AuditTimeline } from "@/components/audit/audit-timeline";
import { ExportAuditButton } from "@/components/audit/export-audit-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AuditVaultViewProps {
  shipmentId: string;
}

export function AuditVaultView({ shipmentId }: AuditVaultViewProps) {
  const { state, refetch } = useAuditTrail(shipmentId);
  const events = state.status === "success" ? state.events : [];

  return (
    <PageContainer>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/shipments/${shipmentId}`}>
            <ArrowLeft />
            Back to shipment results
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Immutable Audit Vault"
        description="Complete EUDR compliance history for this shipment"
        actions={
          <>
            <Badge variant="secondary">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Append-only
            </Badge>
            <ExportAuditButton
              events={events}
              disabled={state.status !== "success" || events.length === 0}
            />
          </>
        }
      />

      {state.status === "error" ? (
        <ErrorCard error={state.error} onRetry={refetch} />
      ) : (
        <AuditTimeline events={events} isLoading={state.status === "loading"} />
      )}
    </PageContainer>
  );
}
