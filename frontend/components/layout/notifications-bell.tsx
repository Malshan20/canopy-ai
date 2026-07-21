"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";

import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/types/notification";

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Replaces the purely presentational bell that used to live in the
 * header — real data, real unread state, real mark-as-read actions.
 * Polls every 30s rather than using a websocket/realtime subscription:
 * simple, reliable, and more than fast enough for "a shipment finished
 * processing a minute ago" — this isn't a chat app.
 */
export function NotificationsBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  async function refresh() {
    const result = await fetchNotifications();
    if (result.ok) {
      setNotifications(result.data.notifications);
      setUnreadCount(result.data.unread_count);
    }
  }

  useEffect(() => {
    function poll() {
      fetchNotifications().then((result) => {
        if (result.ok) {
          setNotifications(result.data.notifications);
          setUnreadCount(result.data.unread_count);
        }
      });
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  async function handleItemClick(notification: NotificationItem) {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
      refresh();
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    refresh();
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Notifications"
              className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Bell className="size-4.5" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-info text-[9px] font-semibold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-7 gap-1 text-xs">
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => {
                const content = (
                  <div
                    className={cn(
                      "block px-3 py-2.5 transition-colors hover:bg-accent",
                      !notification.read_at && "bg-info/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!notification.read_at && (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-info" />
                      )}
                      <div className={cn("min-w-0 flex-1", notification.read_at && "pl-3.5")}>
                        <p className="text-xs font-medium text-foreground">{notification.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{notification.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(notification.created_at)}</p>
                      </div>
                    </div>
                  </div>
                );

                return (
                  <li key={notification.id}>
                    {notification.link ? (
                      <Link href={notification.link} onClick={() => handleItemClick(notification)}>
                        {content}
                      </Link>
                    ) : (
                      <button type="button" className="w-full text-left" onClick={() => handleItemClick(notification)}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
