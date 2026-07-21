"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { useOrganizationAuditTrail } from "@/hooks/use-organization-audit-trail";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorCard } from "@/components/shared/error-card";
import { AuditTimeline } from "@/components/audit/audit-timeline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isCriticalAction } from "@/constants/audit";
import type { AuditEvent } from "@/types/audit";

type SeverityFilter = "all" | "critical";

/**
 * Organization-wide compliance history — every AI action, satellite
 * check, mass balance evaluation, and XML generation across every
 * shipment your organization has processed. Search and the
 * critical-only filter both run client-side against the currently loaded
 * page (simple, fast, and sufficient at this data volume); server-side
 * filtering is a natural follow-up if organizations start generating
 * thousands of events.
 */
export function OrganizationAuditTrailView() {
  const { data, isLoading, isError, error, refetch } = useOrganizationAuditTrail();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");

  const filteredEvents = useMemo(() => {
    const events: AuditEvent[] = data?.events ?? [];
    const lowerQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      if (severity === "critical" && !isCriticalAction(event.action_type)) return false;

      if (!lowerQuery) return true;
      const haystack = [event.actor, event.action_type, JSON.stringify(event.details)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(lowerQuery);
    });
  }, [data, query, severity]);

  return (
    <PageContainer>
      <PageHeader
        title="Audit Trail"
        description="Complete, immutable compliance history across every shipment your organization has processed."
      />

      {isError ? (
        <ErrorCard error={error!} onRetry={() => refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search actor, action, details…"
                aria-label="Search audit events"
                className="pl-8"
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className={cn(severity === "all" && "bg-accent")}
                onClick={() => setSeverity("all")}
              >
                All events
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(severity === "critical" && "bg-danger/10 text-danger")}
                onClick={() => setSeverity("critical")}
              >
                Critical only
              </Button>
            </div>
          </div>

          {data && (
            <p className="text-xs text-muted-foreground">
              Showing {filteredEvents.length} of {data.total} event{data.total === 1 ? "" : "s"}
            </p>
          )}

          <AuditTimeline events={filteredEvents} isLoading={isLoading} />
        </div>
      )}
    </PageContainer>
  );
}
