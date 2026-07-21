"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Leaf } from "lucide-react";

import { NAV_ITEMS } from "@/constants/navigation";
import { APP_NAME } from "@/constants/config";
import { useNavBadges } from "@/hooks/use-nav-badges";
import { cn } from "@/lib/utils";

/**
 * Persistent application sidebar. Every item routes to a real page — see
 * constants/navigation.ts. Active-route highlighting supports nested
 * routes (e.g. /shipments/[id] keeps "Shipments" highlighted) via a
 * prefix match, with "/" handled as an exact match so it doesn't swallow
 * every other route. Items with a `badgeKey` show a live count sourced
 * from `useNavBadges` — only when that count is greater than zero.
 */
export function Sidebar() {
  const pathname = usePathname();
  const badges = useNavBadges();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-forest-500/40">
          <Leaf className="size-4.5 text-forest-50" aria-hidden="true" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          const count = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-200 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                isActive
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-sidebar-accent text-sidebar-foreground",
                  )}
                  aria-label={`${count} items`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="text-xs text-sidebar-muted">EUDR compliance, automated.</p>
      </div>
    </aside>
  );
}
