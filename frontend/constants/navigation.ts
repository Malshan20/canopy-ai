import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  ScanText,
  Waypoints,
  Satellite,
  Users,
  ShieldCheck,
  FileCode,
  Bell,
  History,
  Settings,
} from "lucide-react";

/** Keys the sidebar uses to look up a live count badge (see use-nav-badges.ts). */
export type NavBadgeKey =
  | "documentReview"
  | "satellite"
  | "compliance"
  | "notifications";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When set, the sidebar renders a live count badge from this source. */
  badgeKey?: NavBadgeKey;
}

/**
 * Primary application navigation — the operational surface of CanoryAI,
 * ordered origin-to-outcome: understand the org (Dashboard), see the work
 * (Shipments, AI Document Review), trace it (Supply Chain, Satellite
 * Verification, Suppliers), act on it (Compliance Center, XML Generator),
 * then the cross-cutting surfaces (Notifications, Audit Trail, Settings).
 *
 * Count badges are driven by real data via `use-nav-badges.ts`, never
 * hardcoded — an item shows a badge only when there is genuinely something
 * there.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Shipments", href: "/shipments", icon: Package },
  { label: "AI Document Review", href: "/document-review", icon: ScanText, badgeKey: "documentReview" },
  { label: "Supply Chain", href: "/supply-chain", icon: Waypoints },
  { label: "Satellite Verification", href: "/satellite-verification", icon: Satellite, badgeKey: "satellite" },
  { label: "Suppliers", href: "/suppliers", icon: Users },
  { label: "Compliance Center", href: "/compliance", icon: ShieldCheck, badgeKey: "compliance" },
  { label: "XML Generator", href: "/xml-generator", icon: FileCode },
  { label: "Notifications", href: "/notifications", icon: Bell, badgeKey: "notifications" },
  { label: "Audit Trail", href: "/audit-trail", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];
