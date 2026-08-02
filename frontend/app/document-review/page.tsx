import Link from "next/link";
import { Upload } from "lucide-react";

import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { DocumentReviewView } from "@/components/document-review/document-review-view";

export const metadata = { title: "AI Document Review · CanoryAI" };

export default function DocumentReviewPage() {
  return (
    <PageContainer>
      <PageHeader
        title="AI Document Review"
        description="Confirm or correct the fields the AI wasn't fully sure about. Every approval is recorded in the audit trail."
        actions={
          <Button asChild>
            <Link href="/upload">
              <Upload />
              Upload documents
            </Link>
          </Button>
        }
      />
      <DocumentReviewView />
    </PageContainer>
  );
}
