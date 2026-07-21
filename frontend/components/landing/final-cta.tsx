"use client";

import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { MarketingButton } from "@/components/landing/marketing-button";

/**
 * The closing conversion moment — deliberately quiet relative to the
 * hero (no new visual device introduced here) so the signature
 * "verification window" motif stays a hero/bento-grid moment rather than
 * being diluted by repetition on every section.
 */
export function FinalCta() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="demo" className="relative overflow-hidden border-t border-[var(--mkt-border)] py-28 sm:py-36">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(600px circle at 50% 0%, rgba(11,110,79,0.10), transparent 65%)",
        }}
        animate={prefersReducedMotion ? undefined : { opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8 lg:px-10">
        <h2 className="font-[family-name:var(--font-manrope)] text-4xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-5xl">
          The compliance deadline doesn&apos;t move. Your readiness should start now.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--mkt-body)]">
          Every shipment processed after your enforcement date needs a defensible declaration.
          Get your first automated due diligence statement generated before that date arrives —
          not scrambled together after it.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <MarketingButton
            href="/contact?subject=Enterprise+Demo+Request"
            size="lg"
            icon={<ArrowRight className="size-4" />}
          >
            Book Enterprise Demo
          </MarketingButton>
          <MarketingButton href="/contact?subject=Sales+Inquiry" variant="secondary" size="lg">
            Talk to Sales
          </MarketingButton>
        </div>
      </div>
    </section>
  );
}
