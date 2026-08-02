import Link from "next/link";
import { FileCode, ArrowRight } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "XML Generator · CanoryAI" };

/**
 * This used to be a standalone tool that assembled its own DDS XML
 * client-side, independent of the real, compliance-gated per-shipment
 * flow (`DownloadXmlDialog` / `POST /shipments/{id}/xml`). That
 * independence was the actual bug: it drifted onto a different, unverified
 * schema than the real generator, and a customer-provided real-world DDS
 * example surfaced the gap directly — see
 * backend/app/services/xml_generator.py's module docstring for the full
 * story of what changed and why.
 *
 * Rather than keep two implementations that can drift apart again, this
 * page now points at the one real, accurate, compliance-gated flow
 * instead of reimplementing it a second time.
 */
export default function XmlGeneratorPage() {
  return (
    <PageContainer className="pb-0">
      <PageHeader
        title="XML Generator"
        description="DDS generation now lives on each shipment, not as a standalone tool."
      />
      <EmptyState
        icon={FileCode}
        title="Generate a DDS from a shipment directly"
        description="A DDS document needs a shipment that's actually passed compliance — mass balance and satellite verification both clean. Open the shipment you want to export and use “Download EUDR XML” there; it's the same real, schema-accurate generator, gated on the checks that make the document meaningful in the first place."
        action={
          <Button asChild>
            <Link href="/shipments">
              Go to Shipments
              <ArrowRight />
            </Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
