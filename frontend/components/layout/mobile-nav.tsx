"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Leaf } from "lucide-react";

import { NAV_ITEMS } from "@/constants/navigation";
import { APP_NAME } from "@/constants/config";
import { useNavBadges } from "@/hooks/use-nav-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Mobile primary navigation. The desktop sidebar is `hidden md:flex`, so
 * on small screens this menu button in the header is the only way to move
 * between pages. Mirrors the sidebar exactly — same items, same live
 * badges — and closes itself on navigation.
 */
export function MobileNav() {
  const pathname = usePathname();
  const badges = useNavBadges();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 left-0 h-dvh max-w-xs translate-x-0 translate-y-0 gap-0 rounded-none border-r bg-sidebar p-0 text-sidebar-foreground data-[state=open]:slide-in-from-left sm:rounded-none">
        <DialogHeader className="flex h-16 flex-row items-center gap-2.5 space-y-0 border-b border-sidebar-border px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-forest-500/40">
            <Leaf className="size-4.5 text-forest-50" aria-hidden="true" />
          </div>
          <DialogTitle className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
            {APP_NAME}
          </DialogTitle>
        </DialogHeader>

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
                onClick={() => setOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-sidebar-foreground">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
