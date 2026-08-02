import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { serverFetchJson } from "@/lib/server-api";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ComplianceOverviewCards } from "@/components/compliance/compliance-overview-cards";
import { ComplianceQueueTable } from "@/components/compliance/compliance-queue-table";

export const metadata: Metadata = { title: "Compliance Center" };
import type { ComplianceOverview } from "@/types/organization";

export default async function CompliancePage() {
  const overview = await serverFetchJson<ComplianceOverview>(
    "/api/v1/organizations/me/compliance-overview",
  );

  return (
    <PageContainer>
      <PageHeader
        title="Compliance"
        description="Organization-wide EUDR compliance status: open issues, critical alerts, and generated declarations."
      />

      {overview === null ? (
        <EmptyState
          icon={ShieldCheck}
          title="Compliance data unavailable"
          description="Could not load your organization's compliance overview right now. Try refreshing the page."
        />
      ) : (
        <ComplianceOverviewCards overview={overview} />
      )}

      <div className="mt-8 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Review queue</h2>
          <p className="text-sm text-muted-foreground">
            Shipments that need a compliance manager&apos;s attention — failing an automated check, or
            awaiting export sign-off.
          </p>
        </div>
        <ComplianceQueueTable />
      </div>
    </PageContainer>
  );
}
