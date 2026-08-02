import type { Metadata } from "next";
import { ShipmentResultsView } from "@/components/results/shipment-results-view";

interface ShipmentPageProps {
  params: Promise<{ shipmentId: string }>;
}

export async function generateMetadata({ params }: ShipmentPageProps): Promise<Metadata> {
  const { shipmentId } = await params;
  // Just the route param, no extra fetch — enough to tell multiple open
  // shipment tabs apart, which a flat "Shipment Details" title for every
  // single one wouldn't.
  return { title: `Shipment ${shipmentId.slice(0, 8)}` };
}

export default async function ShipmentPage({ params }: ShipmentPageProps) {
  const { shipmentId } = await params;
  return <ShipmentResultsView shipmentId={shipmentId} />;
}
