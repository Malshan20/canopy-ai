"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

import { APP_NAME } from "@/constants/config";
import { Button } from "@/components/ui/button";

/**
 * Catches any unexpected runtime error thrown by a page or component
 * under the root layout (a bug, an unexpected null, anything that isn't
 * one of the app's own handled API-error states) and shows a real
 * recovery screen instead of a blank, crashed page with no way forward.
 *
 * Renders inside whatever chrome the crashed route already had (the
 * sidebar for an authenticated page, none for a marketing page) — no
 * special-casing needed here, since AppShell already correctly knows
 * which chrome a *known* route gets; that's a different problem from
 * the 404 page's (an *unknown* path AppShell has never seen before).
 *
 * Does not catch errors in the root layout itself — that needs
 * `global-error.tsx`, which exists alongside this file for exactly that
 * separate case.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Real, server-visible signal that something broke — not just a
    // silent blank screen a user has to describe secondhand to support.
    console.error("[CanoryAI] Unhandled error in a page:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-danger/10">
        <AlertTriangle className="size-6 text-danger" aria-hidden="true" />
      </div>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This page hit an unexpected error. It&apos;s been logged — try again, or head back to the
        dashboard.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">Reference: {error.digest}</p>
      )}
      <div className="mt-7 flex gap-2.5">
        <Button onClick={() => reset()}>
          <RotateCcw />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">
            <Home />
            Back to dashboard
          </Link>
        </Button>
      </div>
      <p className="mt-10 text-xs text-muted-foreground/60">{APP_NAME}</p>
    </div>
  );
}
