import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SuppliersView } from "@/components/suppliers/suppliers-view";

export const metadata = { title: "Suppliers · CanoryAI" };

export default function SuppliersPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Suppliers"
        description="Every origin supplier in your supply base, with farm registration, plot verification, and risk at a glance."
      />
      <SuppliersView />
    </PageContainer>
  );
}
