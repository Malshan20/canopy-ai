"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { SectionEyebrow } from "@/components/landing/section-eyebrow";
import { cn } from "@/lib/utils";
import { FAQS } from "@/constants/faq";

/**
 * Accessible accordion: native buttons with `aria-expanded`, standard tab
 * order for keyboard navigation, and Framer Motion's `AnimatePresence`
 * for a height animation that measures actual content rather than a
 * fixed guess.
 *
 * The compliance-timeline answer cites verified current dates (EUDR was
 * postponed a second time in December 2025 — large/medium operators now
 * have until December 30, 2026, not the widely-cited December 2025 date
 * from before that delay) rather than a plausible-sounding but stale one.
 */
export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-[var(--mkt-border)] py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 lg:px-10">
        <Reveal>
          <SectionEyebrow>Frequently asked</SectionEyebrow>
          <h2 className="mt-4 font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            Questions from compliance and security teams.
          </h2>
        </Reveal>

        <div className="mt-12 divide-y divide-[var(--mkt-border)] border-t border-[var(--mkt-border)]">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.question}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${index}`}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mkt-forest)] focus-visible:ring-offset-2"
                  >
                    <span className="text-[15px] font-medium text-[var(--mkt-ink)] sm:text-base">
                      {faq.question}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border",
                        isOpen
                          ? "border-[var(--mkt-forest)] bg-[var(--mkt-forest)] text-white"
                          : "border-[var(--mkt-border)] text-[var(--mkt-muted)]",
                      )}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                    </motion.span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-panel-${index}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pr-10 text-sm leading-relaxed text-[var(--mkt-muted)]">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
