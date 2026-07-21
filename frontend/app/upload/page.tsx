import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { UploadCard } from "@/components/upload/upload-card";

export const metadata: Metadata = { title: "Upload Shipment" };

export default function UploadPage() {
  return (
    <PageContainer constrained={false} className="flex min-h-full items-center justify-center">
      <div className="flex w-full max-w-xl flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Upload supplier documents
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Upload a ZIP archive containing supplier receipts, scanned documents, or PDFs.
            CanoryAI will classify each file and extract structured data automatically.
          </p>
        </div>
        <UploadCard />
      </div>
    </PageContainer>
  );
}
