"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchDashboardSummary } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { DashboardSummary } from "@/types/organization";

export function useDashboardSummary() {
  return useQuery<DashboardSummary, ApiError>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const result = await fetchDashboardSummary();
      if (!result.ok) throw result.error;
      return result.data;
    },
    refetchInterval: 30_000,
  });
}
