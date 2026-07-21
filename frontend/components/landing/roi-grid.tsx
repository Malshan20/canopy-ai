"use client";

import { motion } from "framer-motion";
import { Anchor, ShieldCheck, Sparkles } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { SectionEyebrow } from "@/components/landing/section-eyebrow";
import { StatCounter } from "@/components/landing/stat-counter";

const METRICS = [
  {
    icon: Sparkles,
    value: 94.2,
    decimals: 1,
    suffix: "%",
    valueLabel: undefined as string | undefined,
    title: "AI auto-approval rate",
    description:
      "Nearly all supplier documents are read, classified, and approved without a compliance officer touching them — human review is reserved for the small fraction the model actually flags.",
  },
  {
    icon: Anchor,
    value: 0,
    suffix: "",
    decimals: 0,
    valueLabel: "Zero" as string | undefined,
    title: "Port holding fees",
    description:
      "Declarations are generated before your cargo reaches the border, not after a customs hold forces a scramble — no demurrage, no missed sailing windows.",
  },
  {
    icon: ShieldCheck,
    value: 4,
    suffix: "%",
    decimals: 0,
    valueLabel: undefined as string | undefined,
    title: "Global revenue shield",
    description:
      "EUDR penalties reach up to 4% of an organization's EU-wide annual turnover. A defensible, audit-ready trail is the difference between a fine and a filed declaration.",
  },
];

/**
 * The executive-facing "why this matters in dollars" section — three
 * numbers a CFO would actually ask for, not vanity metrics. Motion here
 * is a hover elevation via Framer Motion on top of the shared `<Reveal>`
 * entrance; the numbers themselves count up via GSAP's ScrollTrigger
 * (`<StatCounter>`), consistent with this page's stated split between
 * the two motion libraries.
 */
export function RoiGrid() {
  return (
    <section id="value" className="border-t border-[var(--mkt-border)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <Reveal>
          <SectionEyebrow>Enterprise value</SectionEyebrow>
          <h2 className="mt-4 max-w-xl font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            Compliance that pays for itself in the first shipment.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {METRICS.map((metric, index) => (
            <Reveal key={metric.title} delay={index * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="h-full rounded-3xl border border-[var(--mkt-border)] bg-white p-8 shadow-[0_1px_2px_rgba(15,23,20,0.04)] transition-shadow hover:shadow-[0_24px_60px_-24px_rgba(15,23,20,0.18)]"
              >
                <div className="flex size-11 items-center justify-center rounded-2xl bg-[var(--mkt-forest)]/[0.08]">
                  <metric.icon className="size-5 text-[var(--mkt-forest)]" aria-hidden="true" />
                </div>

                <p className="mt-6 font-[family-name:var(--font-manrope)] text-4xl font-semibold tracking-tight text-[var(--mkt-ink)]">
                  {metric.valueLabel ?? (
                    <StatCounter value={metric.value} decimals={metric.decimals} suffix={metric.suffix} />
                  )}
                </p>
                <h3 className="mt-2 text-base font-semibold text-[var(--mkt-ink)]">{metric.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--mkt-muted)]">{metric.description}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
