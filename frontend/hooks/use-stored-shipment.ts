"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

import type { StoredShipmentResult } from "@/types/shipment";

const STORAGE_PREFIX = "canopyai:shipment:";

const noopSubscribe = () => () => {};

/**
 * Reads a previously-saved shipment result from `sessionStorage` for the
 * given shipment ID. Implemented with `useSyncExternalStore` rather than a
 * `useEffect` + `setState` pair: sessionStorage is a synchronous external
 * data source, which is exactly what this hook is designed for, and it
 * avoids the SSR/client hydration mismatch a naive read-during-render would
 * cause (the server snapshot is always `null`; the browser snapshot is
 * read on mount).
 */
export function useStoredShipment(shipmentId: string): StoredShipmentResult | null {
  const cacheRef = useRef<{ id: string; value: StoredShipmentResult | null } | null>(null);

  const getSnapshot = useCallback(() => {
    if (cacheRef.current?.id === shipmentId) {
      return cacheRef.current.value;
    }

    let value: StoredShipmentResult | null = null;
    try {
      const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${shipmentId}`);
      value = raw ? (JSON.parse(raw) as StoredShipmentResult) : null;
    } catch (error) {
      console.error("[CanoryAI] Failed to load shipment result:", error);
    }

    cacheRef.current = { id: shipmentId, value };
    return value;
  }, [shipmentId]);

  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(noopSubscribe, getSnapshot, getServerSnapshot);
}
