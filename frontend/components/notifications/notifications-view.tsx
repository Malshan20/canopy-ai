"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCheck, Package, Satellite, ShieldAlert, FileCode, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/api";
import type { NotificationItem } from "@/types/notification";
import type { ApiError } from "@/types/api";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorCard } from "@/components/shared/error-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, LucideIcon> = {
  shipment: Package,
  satellite: Satellite,
  compliance: ShieldAlert,
  xml: FileCode,
  export: FileCode,
};

function iconFor(type: string): LucideIcon {
  return TYPE_ICON[type] ?? Info;
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type Filter = "all" | "unread";

export function NotificationsView() {
  const { data, isLoading, isError, error, refetch } = useQuery<NotificationItem[], ApiError>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const result = await fetchNotifications();
      if (!result.ok) throw result.error;
      return result.data.notifications;
    },
    refetchInterval: 30_000,
  });

  // Optimistic read overlay: id -> read_at ISO, applied on top of fetched data
  // so marking read is instant without waiting for a refetch.
  const [readOverlay, setReadOverlay] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");

  const notifications = useMemo(() => {
    if (!data) return [];
    return data.map((n) => (readOverlay[n.id] ? { ...n, read_at: readOverlay[n.id]! } : n));
  }, [data, readOverlay]);

  async function onMarkRead(id: string) {
    setReadOverlay((prev) => ({ ...prev, [id]: new Date().toISOString() }));
    await markNotificationRead(id);
  }

  async function onMarkAll() {
    const now = new Date().toISOString();
    setReadOverlay((prev) => {
      const next = { ...prev };
      for (const n of notifications) next[n.id] = n.read_at ?? now;
      return next;
    });
    const result = await markAllNotificationsRead();
    if (result.ok) toast.success("All notifications marked as read");
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorCard error={error} onRetry={() => refetch()} />;
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="You're all caught up"
        description="Notifications about shipment processing, satellite alerts, and compliance events will appear here."
      />
    );
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  const visible = filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(["all", "unread"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
              {f === "unread" && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>

        <Button variant="outline" size="sm" onClick={onMarkAll} disabled={unreadCount === 0}>
          <CheckCheck />
          Mark all read
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No unread notifications.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((notification) => {
            const Icon = iconFor(notification.type);
            const isUnread = !notification.read_at;
            const body = (
              <div
                className={cn(
                  "flex items-start gap-4 rounded-xl border p-4 transition-colors",
                  isUnread ? "border-primary/20 bg-accent/40" : "border-border bg-card",
                )}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4.5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                    {isUnread && <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{notification.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{timeAgo(notification.created_at)}</p>
                </div>
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      onMarkRead(notification.id);
                    }}
                  >
                    Mark read
                  </Button>
                )}
              </div>
            );

            return notification.link ? (
              <Link
                key={notification.id}
                href={notification.link}
                onClick={() => isUnread && onMarkRead(notification.id)}
                className="block"
              >
                {body}
              </Link>
            ) : (
              <div key={notification.id}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
