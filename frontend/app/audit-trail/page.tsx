import type { Metadata } from "next";
import { OrganizationAuditTrailView } from "@/components/audit/organization-audit-trail-view";

export const metadata: Metadata = { title: "Audit Trail" };

export default function AuditTrailPage() {
  return <OrganizationAuditTrailView />;
}
