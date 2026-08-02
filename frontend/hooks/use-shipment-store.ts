"use client";

import { useCallback } from "react";

import type { ShipmentUploadResponse, StoredShipmentResult } from "@/types/shipment";

const STORAGE_PREFIX = "canopyai:shipment:";

/**
 * Persists a processed shipment result to `sessionStorage` so the results
 * dashboard is reachable via a real route (`/shipments/[shipmentId]`)
 * rather than only through in-memory router state that disappears on
 * refresh.
 *
 * `useShipmentDetail` always prefers this cache over a fresh network
 * fetch when it's present (see that hook's docstring) — which is exactly
 * right immediately after upload, but becomes a real bug the moment
 * something *else* changes the shipment server-side later, e.g. a live
 * satellite re-check (`SatelliteVerifyDialog`'s "Re-check GFW" button,
 * which now correctly persists to the backend — see
 * `DocumentReviewService.reverify_satellite`). Without `invalidate`,
 * this stale snapshot would keep winning over the now-correct server
 * data on every subsequent reload, forever, for the rest of that browser
 * tab's session — which is exactly the bug this fixes: the badge
 * appeared to revert to "Pending Verification" on reload not because
 * persistence failed, but because the frontend was still reading a
 * cached copy from before the re-check and never asked the backend
 * again.
 *
 * Reading a saved result back is handled separately by
 * `useStoredShipment`, which uses `useSyncExternalStore` for
 * hydration-safe reads.
 */
export function useShipmentStore() {
  const save = useCallback(
    (response: ShipmentUploadResponse, sourceFilename: string, processingTimeSeconds: number) => {
      const record: StoredShipmentResult = {
        response,
        receivedAt: new Date().toISOString(),
        processingTimeSeconds,
        sourceFilename,
      };
      try {
        sessionStorage.setItem(
          `${STORAGE_PREFIX}${response.shipment_id}`,
          JSON.stringify(record),
        );
      } catch (error) {
        console.error("[CanoryAI] Failed to persist shipment result:", error);
      }
    },
    [],
  );

  const invalidate = useCallback((shipmentId: string) => {
    try {
      sessionStorage.removeItem(`${STORAGE_PREFIX}${shipmentId}`);
    } catch (error) {
      console.error("[CanoryAI] Failed to invalidate cached shipment result:", error);
    }
  }, []);

  return { save, invalidate };
}
