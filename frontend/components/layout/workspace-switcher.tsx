"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Check, Mail, Loader2, Building2 } from "lucide-react";

import { fetchMemberships, getActiveOrganizationId, setActiveOrganizationId } from "@/services/api";
import { DEFAULT_WORKSPACE_NAME, SALES_EMAIL } from "@/constants/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MembershipItem } from "@/types/organization";

/**
 * Real workspace switching, backed by data this codebase already had —
 * `X-Organization-Id` header support and multi-org membership were both
 * already built into the backend's auth layer, just never surfaced here.
 * See backend/app/core/auth.py's get_current_user for the full mechanism;
 * this component is purely the UI for choosing which of the caller's own
 * verified memberships is "active" right now.
 *
 * There is deliberately no "create a new workspace" action here. This
 * used to open a dialog that called the same self-serve
 * `POST /organizations` endpoint `signup-form.tsx` did — any existing
 * user could spin up an unrelated, brand-new organization on a whim, no
 * different in kind from the self-serve signup problem, just reached
 * from inside the app instead of before login. That endpoint no longer
 * exists; "Add workspace" is now the same honest mailto contact every
 * other "get a new workspace" entry point in the app uses.
 */
export function WorkspaceSwitcher() {
  const [memberships, setMemberships] = useState<MembershipItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    fetchMemberships().then((result) => {
      if (!result.ok) return;
      setMemberships(result.data);

      const stored = getActiveOrganizationId();
      const validStored = stored && result.data.some((m) => m.organization_id === stored) ? stored : null;
      const resolved = validStored ?? result.data[0]?.organization_id ?? null;

      if (resolved) {
        setActiveId(resolved);
        setActiveOrganizationId(resolved);
      }
    });
  }, []);

  function handleSwitch(organizationId: string) {
    if (organizationId === activeId) return;
    setActiveOrganizationId(organizationId);
    setActiveId(organizationId);
    // Every dashboard/shipments/settings page fetches data scoped to
    // whichever organization X-Organization-Id currently points at —
    // a full reload is the simplest way to guarantee every one of them
    // re-fetches under the new workspace rather than showing stale data
    // from the previous one.
    window.location.reload();
  }

  const activeMembership = memberships?.find((m) => m.organization_id === activeId);
  const displayName = activeMembership?.name ?? DEFAULT_WORKSPACE_NAME;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hidden items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:flex">
        <span className="max-w-[180px] truncate">{displayName}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships === null ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : memberships.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No workspaces yet.</p>
        ) : (
          memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.organization_id}
              onSelect={() => handleSwitch(membership.organization_id)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 truncate">
                <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{membership.name}</span>
              </span>
              {membership.organization_id === activeId && (
                <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="flex items-center gap-2">
          <a href={`mailto:${SALES_EMAIL}`}>
            <Mail className="size-3.5" aria-hidden="true" />
            Request a workspace
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
