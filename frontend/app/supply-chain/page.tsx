import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SupplyChainView } from "@/components/supply-chain/supply-chain-view";

export const metadata = { title: "Supply Chain · CanoryAI" };

export default function SupplyChainPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Supply Chain"
        description="Full chain of custody for each commodity flow — from origin plots through processing and export to EU import. Breaks in traceability are surfaced automatically."
      />
      <SupplyChainView />
    </PageContainer>
  );
}
