"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchShipmentsList } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { ShipmentListResponse } from "@/types/shipment";

/**
 * Real-time-ish synchronization for the Shipments list: refetches every
 * 15s while the tab is focused (TanStack Query pauses interval refetching
 * when the tab is backgrounded by default), so a teammate's upload shows
 * up without a manual page refresh.
 *
 * Honest architecture note: CanoryAI's upload pipeline
 * (`POST /shipments/upload-zip`) is synchronous — the request blocks
 * until AI extraction, satellite verification, and mass balance are all
 * complete, then returns the final result in one response. There is no
 * "Queued -> Processing -> Verifying" pollable per-shipment status to
 * subscribe to, because no such asynchronous job exists on the backend.
 * Interval polling of this real list endpoint is what "the user never
 * needs to manually refresh" honestly means for *this* architecture — see
 * `components/upload/processing-overlay.tsx` for how the single in-flight
 * upload request's own loading state is communicated instead.
 */
export function useShipmentsList(page = 1, pageSize = 25) {
  return useQuery<ShipmentListResponse, ApiError>({
    queryKey: ["shipments", page, pageSize],
    queryFn: async () => {
      const result = await fetchShipmentsList(page, pageSize);
      if (!result.ok) throw result.error;
      return result.data;
    },
    refetchInterval: 15_000,
  });
}
