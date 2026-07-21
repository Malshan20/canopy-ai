"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchComplianceOverview } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { ComplianceOverview } from "@/types/organization";

export function useComplianceOverview() {
  return useQuery<ComplianceOverview, ApiError>({
    queryKey: ["compliance-overview"],
    queryFn: async () => {
      const result = await fetchComplianceOverview();
      if (!result.ok) throw result.error;
      return result.data;
    },
    refetchInterval: 30_000,
  });
}
