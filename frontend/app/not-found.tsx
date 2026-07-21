import Link from "next/link";
import type { Metadata } from "next";
import { Home, MessageCircle, TreePine, Compass } from "lucide-react";

import { APP_NAME } from "@/constants/config";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * The site has no route groups, so `AppShell` (which decides sidebar
 * chrome purely from an allowlist of known paths — see its own docstring)
 * has no way to know a not-found path was never a real route at all. A
 * genuinely mistyped URL can land here wrapped in the full authenticated
 * sidebar/header, correct or not for whoever hit it. Rather than teach
 * `AppShell` to special-case a page it can't actually detect, this page
 * is `fixed inset-0` with its own opaque background and a high z-index —
 * it always fills and owns the entire viewport itself, so it looks
 * correct regardless of whatever it's rendered inside.
 *
 * Zero client JS: no useState, no useEffect, no "use client" — the
 * ambient motion is a single CSS keyframe (`animate-ambient-drift`,
 * globals.css), respecting `prefers-reduced-motion` the same way the
 * marketing site's marquee does.
 */
export default function NotFound() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background">
      {/* Ambient background: soft forest-toned shapes, slow drift */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-ambient-drift absolute -left-24 -top-24 size-96 rounded-full bg-forest-500/10 blur-3xl" />
        <div className="animate-ambient-drift absolute -bottom-24 -right-24 size-96 rounded-full bg-forest-500/10 blur-3xl [animation-delay:3s]" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--forest-500) / 0.15) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-md flex-col items-center px-6 text-center">
        <div className="relative mb-2 flex size-20 items-center justify-center">
          <div className="absolute inset-0 rounded-3xl bg-forest-500/10" />
          <TreePine className="size-9 text-forest-500" aria-hidden="true" />
          <Compass
            className="absolute -bottom-1.5 -right-1.5 size-7 rounded-full border-4 border-background bg-forest-500 p-1 text-forest-50"
            aria-hidden="true"
          />
        </div>

        <p className="mt-2 font-mono text-sm font-semibold tracking-widest text-forest-500">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          You&apos;ve wandered off the trail
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist, moved, or never had a canopy over
          it to begin with. Let&apos;s get you back on solid ground.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">
              <Home />
              Back to home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contact">
              <MessageCircle />
              Contact support
            </Link>
          </Button>
        </div>

        <p className="mt-10 text-xs text-muted-foreground/70">{APP_NAME} · EUDR compliance, automated.</p>
      </div>
    </div>
  );
}
