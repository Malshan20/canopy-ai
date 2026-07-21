import type { ReactNode } from "react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

interface ContentPageLayoutProps {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared wrapper for long-form marketing-site pages (legal documents,
 * the EUDR guide, API docs) — Navbar + a centered prose column + Footer.
 * Deliberately no SmoothScrollProvider here, unlike app/page.tsx: Lenis's
 * smooth-scroll is a nice flourish for a short landing page, but native
 * scroll is the right choice for a long document someone might jump
 * around in via in-page anchor links or browser find-in-page.
 */
export function ContentPageLayout({ eyebrow, title, lastUpdated, children }: ContentPageLayoutProps) {
  return (
    <div className="marketing font-sans">
      <Navbar />
      <main className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:px-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--mkt-forest)]">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-[var(--mkt-muted)]">Last updated: {lastUpdated}</p>

        <div className="prose-content mt-12">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
