"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchShipmentsList, fetchShipmentDetail } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { DocumentResult, ComplianceSummary, ShipmentListItem } from "@/types/shipment";

/** A real processed document, enriched with the shipment it belongs to. */
export interface OrgDocument {
  doc: DocumentResult;
  shipmentId: string;
  shipmentRef: string;
  commodity: string | null;
  country: string | null;
  createdAt: string;
}

export interface OrgShipmentDetail {
  shipment: ShipmentListItem;
  documents: DocumentResult[];
  compliance: ComplianceSummary;
}

/**
 * The real, org-wide document set. There is no single "all documents"
 * endpoint on the backend, so this assembles the set from the real
 * shipments API: list every shipment, load each one's processed result,
 * and flatten the documents — each carrying its genuine extracted fields
 * and (GFW-derived) satellite verification. This is live data straight
 * from the pipeline, refreshed on an interval.
 *
 * Bounded to the first 100 shipments to keep the fan-out sane; when the
 * backend grows a dedicated aggregate endpoint (e.g. `/documents`,
 * `/plots`), swap the queryFn here and every consuming page keeps working.
 */
async function loadOrgData(): Promise<{ documents: OrgDocument[]; shipments: OrgShipmentDetail[] }> {
  const list = await fetchShipmentsList(1, 100);
  if (!list.ok) throw list.error;

  const items = list.data.shipments;
  const details = await Promise.all(items.map((item) => fetchShipmentDetail(item.id)));

  const documents: OrgDocument[] = [];
  const shipments: OrgShipmentDetail[] = [];

  details.forEach((result, index) => {
    const shipment = items[index];
    if (!shipment || !result.ok) return;

    shipments.push({
      shipment,
      documents: result.data.documents,
      compliance: result.data.compliance,
    });

    for (const doc of result.data.documents) {
      documents.push({
        doc,
        shipmentId: shipment.id,
        shipmentRef: shipment.source_filename ?? shipment.id,
        commodity: shipment.commodity,
        country: shipment.country_of_production,
        createdAt: shipment.created_at,
      });
    }
  });

  return { documents, shipments };
}

export function useOrgData() {
  return useQuery<{ documents: OrgDocument[]; shipments: OrgShipmentDetail[] }, ApiError>({
    queryKey: ["org-data"],
    queryFn: loadOrgData,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
