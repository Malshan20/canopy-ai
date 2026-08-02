"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

/** Routes that render without the authenticated app chrome (no sidebar/header). */
const CHROMELESS_ROUTES = [
  "/login",
  "/signup",
  "/onboarding",
  "/",
  "/privacy",
  "/terms",
  "/data-processing",
  "/eudr-guide",
  "/api-docs",
  "/contact",
  "/about",
  "/security",
];
/** Prefix-matched chromeless routes — /invite/callback, /invite/set-password, /contact/track. */
const CHROMELESS_PREFIXES = ["/invite", "/contact/track"];

/**
 * The reusable application shell: persistent sidebar + top header wrapping
 * a scrollable main content area. Every route in `app/` renders inside
 * this shell via the root layout, so new pages get consistent chrome for
 * free — except a small allowlist of chromeless routes (signed-out or
 * mid-onboarding visitors who shouldn't see authenticated navigation yet).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isChromeless =
    CHROMELESS_ROUTES.includes(pathname) || CHROMELESS_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isChromeless) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
