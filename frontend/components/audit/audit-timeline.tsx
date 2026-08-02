"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ActorBadge } from "@/components/audit/actor-badge";
import { ActionBadge } from "@/components/audit/action-badge";
import { AuditEventDetails } from "@/components/audit/audit-event-details";
import { isCriticalAction } from "@/constants/audit";
import { cn, formatDateTime } from "@/lib/utils";
import type { AuditEvent } from "@/types/audit";

interface AuditTimelineProps {
  events: AuditEvent[];
  isLoading?: boolean;
}

export function AuditTimeline({ events, isLoading = false }: AuditTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon={History}
          title="No audit events yet"
          description="Once this shipment starts processing, every AI action, satellite check, and compliance decision will appear here."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="max-h-[640px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const isExpanded = expandedIds.has(event.id);
              const critical = isCriticalAction(event.action_type);

              return (
                <Fragment key={event.id}>
                  <TableRow
                    className={cn("cursor-pointer", critical && "bg-danger/[0.03]")}
                    onClick={() => toggleExpanded(event.id)}
                    aria-expanded={isExpanded}
                  >
                    <TableCell>
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {formatDateTime(event.timestamp)}
                    </TableCell>
                    <TableCell>
                      <ActorBadge actor={event.actor} />
                    </TableCell>
                    <TableCell>
                      <ActionBadge actionType={event.action_type} />
                    </TableCell>
                    <TableCell className="max-w-sm truncate text-sm text-muted-foreground">
                      {summarize(event)}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-muted/30 py-4">
                        <AuditEventDetails details={event.details} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** Best-effort one-line summary of an event's details for the collapsed row. */
function summarize(event: AuditEvent): string {
  const { details } = event;
  const parts: string[] = [];

  if (typeof details.filename === "string") parts.push(String(details.filename));
  if (typeof details.confidence === "number") parts.push(`${Math.round(details.confidence * 100)}% confidence`);
  if (typeof details.status === "string") parts.push(String(details.status));
  if (typeof details.severity === "string") parts.push(`severity: ${details.severity}`);
  if (typeof details.plot_count === "number") parts.push(`${details.plot_count} plot(s)`);

  return parts.length > 0 ? parts.join(" · ") : "Click to view details";
}
