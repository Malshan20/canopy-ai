"use client";

import { useEffect, useState } from "react";

import { useStoredShipment } from "@/hooks/use-stored-shipment";
import { fetchShipmentDetail } from "@/services/api";
import type { StoredShipmentResult } from "@/types/shipment";
import type { ApiError } from "@/types/api";

export type ShipmentDetailState =
  | { status: "loading" }
  | { status: "found"; result: StoredShipmentResult; source: "cache" | "server" }
  | { status: "not-found" }
  | { status: "error"; error: ApiError };

/**
 * Resolves a shipment's full result for the detail page: `sessionStorage`
 * first (instant, no network — the common case right after an upload),
 * falling back to `GET /shipments/{id}` when it isn't there (a different
 * session, device, or tab reopened later). This is what actually closes
 * the "results not cached in this browser session" gap that shipped with
 * the Shipments list page — that page can now link to *any* shipment in
 * the organization, not just ones uploaded in the current tab, and this
 * hook is what makes clicking through to them actually work.
 *
 * The backend's `ShipmentUploadResponse` doesn't carry the original
 * upload filename (only the `shipments` table row does, not the JSONB
 * payload) — for a server-sourced result, `sourceFilename` falls back to
 * a shortened shipment ID rather than fabricating a name.
 */
export function useShipmentDetail(shipmentId: string): ShipmentDetailState {
  const cached = useStoredShipment(shipmentId);
  const [serverState, setServerState] = useState<ShipmentDetailState>({ status: "loading" });

  useEffect(() => {
    if (cached !== null) return; // fast path already satisfied — skip the network entirely

    let cancelled = false;

    fetchShipmentDetail(shipmentId).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        if (result.error.status === 404) {
          setServerState({ status: "not-found" });
        } else {
          setServerState({ status: "error", error: result.error });
        }
        return;
      }

      setServerState({
        status: "found",
        source: "server",
        result: {
          response: result.data,
          receivedAt: new Date().toISOString(),
          processingTimeSeconds: 0,
          sourceFilename: `Shipment ${shipmentId.slice(0, 8)}`,
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [shipmentId, cached]);

  if (cached !== null) {
    return { status: "found", source: "cache", result: cached };
  }
  return serverState;
}
