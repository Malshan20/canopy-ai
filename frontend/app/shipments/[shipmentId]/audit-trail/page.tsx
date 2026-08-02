import type { Metadata } from "next";
import { AuditVaultView } from "@/components/audit/audit-vault-view";

interface AuditTrailPageProps {
  params: Promise<{ shipmentId: string }>;
}

export async function generateMetadata({ params }: AuditTrailPageProps): Promise<Metadata> {
  const { shipmentId } = await params;
  return { title: `Audit Trail — Shipment ${shipmentId.slice(0, 8)}` };
}

export default async function AuditTrailPage({ params }: AuditTrailPageProps) {
  const { shipmentId } = await params;
  return <AuditVaultView shipmentId={shipmentId} />;
}
