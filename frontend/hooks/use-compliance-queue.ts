"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchShipmentsList, fetchShipmentExportApproval, fetchOrganizationProfile } from "@/services/api";
import type { ShipmentApproval } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { ShipmentListItem } from "@/types/shipment";

export interface ComplianceQueueItem {
  shipment: ShipmentListItem;
  approval: ShipmentApproval | null;
}

export interface ComplianceQueueData {
  items: ComplianceQueueItem[];
  requireExportApproval: boolean;
}

/**
 * The real, actionable compliance queue — every shipment that needs a
 * compliance manager's attention before it can be exported, plus its
 * current export-approval sign-off state. Two things gate "attention":
 * failing the automated compliance checks (readiness/mass balance), and
 * — if the organization has turned this on — not yet having an explicit
 * human sign-off recorded in `shipment_approvals`.
 *
 * Bounded to the first 100 shipments, matching the same pattern used
 * elsewhere in the app (`use-org-data.ts`, `use-nav-badges.ts`) — see
 * those hooks' docstrings for the honest cost/latency tradeoff and the
 * one-line swap once a dedicated aggregate endpoint exists.
 */
export function useComplianceQueue() {
  return useQuery<ComplianceQueueData, ApiError>({
    queryKey: ["compliance-queue"],
    queryFn: async () => {
      const [listResult, profileResult] = await Promise.all([
        fetchShipmentsList(1, 100),
        fetchOrganizationProfile(),
      ]);

      const shipments = listResult.ok ? listResult.data.shipments : [];
      const requireExportApproval = profileResult.ok ? profileResult.data.require_export_approval : false;

      const needsAttention = shipments.filter((s) => {
        const failsChecks = s.readiness !== "ready" || s.mass_balance_status !== "compliant" || (s.critical_farms ?? 0) > 0;
        return failsChecks || requireExportApproval;
      });

      const approvals = requireExportApproval
        ? await Promise.all(
            needsAttention.map(async (s) => {
              const result = await fetchShipmentExportApproval(s.id);
              return result.ok ? result.data : null;
            }),
          )
        : needsAttention.map(() => null);

      const items: ComplianceQueueItem[] = needsAttention
        .map((shipment, i) => ({ shipment, approval: approvals[i] ?? null }))
        // Least-ready first: blocked/needs_review before ready-but-unsigned.
        .sort((a, b) => {
          const rank = { blocked: 0, needs_review: 1, ready: 2 } as const;
          const aRank = a.shipment.readiness ? rank[a.shipment.readiness] : 1;
          const bRank = b.shipment.readiness ? rank[b.shipment.readiness] : 1;
          return aRank - bRank;
        });

      return { items, requireExportApproval };
    },
    refetchInterval: 60_000,
  });
}
