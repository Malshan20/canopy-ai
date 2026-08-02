"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchShipmentsList, fetchNotifications } from "@/services/api";
import type { NavBadgeKey } from "@/constants/navigation";

const REVIEW_THRESHOLD = 0.85;

/**
 * Live sidebar badge counts, sourced from real endpoints only and kept
 * deliberately cheap so they can run on every page: one shipments-list
 * request (already aggregated per shipment by the backend) plus the
 * notifications count. No per-document fan-out here — the heavier
 * document-level views do that on their own pages.
 *
 *  - documentReview: shipments whose average extraction confidence is below
 *                    the review threshold
 *  - satellite:      farms where forest loss was detected (critical_farms)
 *  - compliance:     shipments not yet ready for a due diligence statement
 *  - notifications:  unread notifications
 *
 * A badge only shows when its count is greater than zero.
 */
export function useNavBadges(): Partial<Record<NavBadgeKey, number>> {
  const { data: shipments } = useQuery({
    queryKey: ["nav-shipments"],
    queryFn: async () => {
      const result = await fetchShipmentsList(1, 100);
      return result.ok ? result.data.shipments : [];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: unread } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const result = await fetchNotifications();
      return result.ok ? result.data.unread_count : 0;
    },
    refetchInterval: 30_000,
  });

  const list = shipments ?? [];

  return {
    documentReview: list.filter(
      (s) => s.average_confidence !== null && s.average_confidence < REVIEW_THRESHOLD,
    ).length,
    satellite: list.reduce((sum, s) => sum + (s.critical_farms ?? 0), 0),
    compliance: list.filter((s) => s.readiness !== null && s.readiness !== "ready").length,
    notifications: unread ?? 0,
  };
}
