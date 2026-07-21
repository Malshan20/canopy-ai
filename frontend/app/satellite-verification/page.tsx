import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SatelliteView } from "@/components/satellite/satellite-view";

export const metadata = { title: "Satellite Verification · CanoryAI" };

export default function SatelliteVerificationPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Satellite Verification"
        description="Every plot checked against Global Forest Watch tree-cover-loss data, back to the 31 Dec 2020 EUDR cutoff. Select a plot to inspect its satellite view."
      />
      <SatelliteView />
    </PageContainer>
  );
}
