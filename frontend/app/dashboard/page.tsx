import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, Upload } from "lucide-react";

import { serverFetchJson } from "@/lib/server-api";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DashboardSummaryCards } from "@/components/dashboard/dashboard-summary-cards";
import { Button } from "@/components/ui/button";
import type { DashboardSummary } from "@/types/organization";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Executive overview. A Server Component — fetched directly from the
 * backend using the caller's session (see `lib/server-api.ts`) with no
 * client-side loading spinner needed, since the data is available before
 * the page ever reaches the browser.
 */
export default async function DashboardPage() {
  const summary = await serverFetchJson<DashboardSummary>("/api/v1/organizations/me/summary");

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="Executive overview of your organization's EUDR compliance activity."
      />

      {summary === null ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Dashboard data unavailable"
          description="Could not load your organization's summary right now. Try refreshing the page."
        />
      ) : summary.total_shipments === 0 ? (
        <EmptyState
          icon={Upload}
          title="No shipments yet"
          description="Upload your first shipment to start seeing compliance data here."
          action={
            <Button asChild>
              <Link href="/upload">
                <Upload />
                Upload a shipment
              </Link>
            </Button>
          }
        />
      ) : (
        <DashboardSummaryCards summary={summary} />
      )}
    </PageContainer>
  );
}
