"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchAuditTrail } from "@/services/api";
import type { AuditEvent } from "@/types/audit";
import type { ApiError } from "@/types/api";

type AuditTrailState =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; events: AuditEvent[] };

interface UseAuditTrailResult {
  state: AuditTrailState;
  refetch: () => void;
}

/**
 * Fetches and holds the audit trail for a shipment. Exposes a discriminated
 * `state` (loading/error/success) rather than separate booleans, so
 * components can't accidentally render an impossible combination (e.g.
 * "loading" while also showing stale error text).
 */
export function useAuditTrail(shipmentId: string): UseAuditTrailResult {
  const [state, setState] = useState<AuditTrailState>({ status: "loading" });
  const [refetchCount, setRefetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchAuditTrail(shipmentId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({ status: "error", error: result.error });
        return;
      }
      setState({ status: "success", events: result.data.events });
    });

    return () => {
      cancelled = true;
    };
  }, [shipmentId, refetchCount]);

  const refetch = useCallback(() => {
    setState({ status: "loading" });
    setRefetchCount((count) => count + 1);
  }, []);

  return { state, refetch };
}
