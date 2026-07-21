"use client";

import { useRouter } from "next/navigation";

import { APP_NAME } from "@/constants/config";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Separator } from "@/components/ui/separator";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { MobileNav } from "@/components/layout/mobile-nav";
import { GlobalSearch } from "@/components/layout/global-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Top navigation bar: workspace switcher, global search, notifications,
 * and the user menu.
 */
export function Header() {
  const router = useRouter();
  const { user } = useCurrentUser();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "CA";

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-4 md:px-6">
      <div className="flex items-center gap-1 md:hidden">
        <MobileNav />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </span>
      </div>

      <WorkspaceSwitcher />

      <Separator orientation="vertical" className="hidden h-6 md:block" />

      <div className="hidden max-w-sm flex-1 md:block">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <NotificationsBell />

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className="ml-1 flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {initials}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="max-w-[220px] truncate font-normal text-muted-foreground">
              {user?.email ?? "My account"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              Workspace settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
