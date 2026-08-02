import type { Metadata } from "next";
import { ShipmentsDataTable } from "@/components/shipments-list/shipments-data-table";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Shipments" };

export default function ShipmentsListPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Shipments"
        description="Every shipment your organization has processed, newest first. Updates automatically."
      />
      <ShipmentsDataTable />
    </PageContainer>
  );
}
