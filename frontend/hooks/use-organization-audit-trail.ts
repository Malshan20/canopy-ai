"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchOrganizationAuditTrail } from "@/services/api";
import type { ApiError } from "@/types/api";
import type { OrganizationAuditTrailResponse } from "@/types/audit";

export function useOrganizationAuditTrail(page = 1, pageSize = 100) {
  return useQuery<OrganizationAuditTrailResponse, ApiError>({
    queryKey: ["organization-audit-trail", page, pageSize],
    queryFn: async () => {
      const result = await fetchOrganizationAuditTrail(page, pageSize);
      if (!result.ok) throw result.error;
      return result.data;
    },
    refetchInterval: 30_000,
  });
}
