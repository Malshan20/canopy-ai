"use client";

import { useEffect, useRef } from "react";
import { FileUp, ScanText, SatelliteDish, FileCheck2 } from "lucide-react";

import { ensureGsapRegistered, gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Reveal } from "@/components/landing/reveal";
import { SectionEyebrow } from "@/components/landing/section-eyebrow";

interface Step {
  icon: typeof FileUp;
  title: string;
  description: string;
  details: string[];
}

/**
 * The service, explained as the pipeline it actually is — four stages
 * from a supplier's paper receipt to a filed declaration. Numbered
 * markers are earned here (this is a genuine sequence, per the page's
 * own structural-devices rule), and each stage carries the concrete,
 * verifiable specifics — file formats, the regulation's 2020 cutoff
 * date, Article references — that make "well detailed" mean something.
 *
 * Motion: a vertical spine draws itself down the section, scrubbed to
 * scroll via GSAP ScrollTrigger (this is a choreographed, scroll-linked
 * moment, so GSAP rather than <Reveal> per the page's motion split),
 * while each step's node fills in as the spine passes it. Static under
 * reduced motion: spine fully drawn, all nodes filled.
 */
const STEPS: Step[] = [
  {
    icon: FileUp,
    title: "Ingest supplier documents",
    description:
      "Drop documents in as they arrive from the field — no templates, no pre-processing, no asking a smallholder co-op to change how it works.",
    details: [
      "PDFs, scans, and phone photos of handwritten receipts",
      "Bulk upload, email forwarding, or the REST API",
      "Every file fingerprinted on arrival for the audit trail",
    ],
  },
  {
    icon: ScanText,
    title: "AI reads and structures everything",
    description:
      "Vision AI extracts farmer names, plot coordinates, weights, and harvest dates from free-form documents — and tells you exactly how sure it is about each field.",
    details: [
      "Per-field confidence scores, not a single black-box grade",
      "Low-confidence fields routed to human review automatically",
      "Structured output linked back to the exact source pixel region",
    ],
  },
  {
    icon: SatelliteDish,
    title: "Satellites verify every plot",
    description:
      "Each GPS coordinate and plot polygon is checked against Global Forest Watch tree-cover-loss data, back to the regulation's December 31, 2020 cutoff.",
    details: [
      "Deforestation screening on every plot, not a sample",
      "Country benchmarking folded into Article 10 risk assessment",
      "Clean, warning, or fail — with the imagery to prove it",
    ],
  },
  {
    icon: FileCheck2,
    title: "A defensible declaration, ready to review",
    description:
      "CanoryAI assembles the Article 4 due diligence statement, generates a DDS document structured to match the real TRACES NT schema, and seals the entire evidence chain into the append-only audit vault.",
    details: [
      "Structured to match the real TRACES NT DDS schema",
      "Geolocation, risk assessment, and mitigation in one record",
      "Immutable evidence chain for the day an authority asks",
    ],
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !sectionRef.current) return;
    ensureGsapRegistered();

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".workflow-spine-fill",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: ".workflow-steps",
            start: "top 70%",
            end: "bottom 55%",
            scrub: 0.6,
          },
        },
      );

      gsap.utils.toArray<HTMLElement>(".workflow-node").forEach((node) => {
        gsap.fromTo(
          node,
          { backgroundColor: "rgba(255,255,255,1)", borderColor: "var(--mkt-border)" },
          {
            backgroundColor: "#0b6e4f",
            borderColor: "#0b6e4f",
            color: "#ffffff",
            duration: 0.35,
            scrollTrigger: { trigger: node, start: "top 62%", once: true },
          },
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      id="workflow"
      ref={sectionRef}
      className="border-t border-[var(--mkt-border)] bg-white py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <Reveal>
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            From a handwritten receipt to a filed declaration — in four stages.
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--mkt-muted)]">
            The same pipeline runs on every shipment: nothing skipped, nothing sampled, every
            step recorded. This is what your auditor sees, too.
          </p>
        </Reveal>

        <div className="workflow-steps relative mt-16">
          {/* The spine: a static hairline track with a scroll-scrubbed forest-green
              fill drawn over it. Hidden on mobile, where the cards stack full-width. */}
          <div
            className="absolute bottom-8 left-[27px] top-2 hidden w-px bg-[var(--mkt-border)] md:block"
            aria-hidden="true"
          >
            <div
              className="workflow-spine-fill h-full w-full origin-top bg-[var(--mkt-forest)]"
              style={prefersReducedMotion ? undefined : { transform: "scaleY(0)" }}
            />
          </div>

          <ol className="space-y-10 md:space-y-14">
            {STEPS.map((step, index) => (
              <Reveal key={step.title} as="li" delay={index * 0.05} className="relative md:pl-24">
                <div
                  className={
                    "workflow-node absolute left-0 top-0 hidden size-14 items-center justify-center rounded-2xl border text-[var(--mkt-forest)] md:flex " +
                    (prefersReducedMotion
                      ? "border-[var(--mkt-forest)] bg-[var(--mkt-forest)] !text-white"
                      : "border-[var(--mkt-border)] bg-white")
                  }
                >
                  <step.icon className="size-6" aria-hidden="true" />
                </div>

                <div className="rounded-3xl border border-[var(--mkt-border)] bg-[var(--mkt-canvas)] p-7 transition-shadow hover:shadow-[0_24px_60px_-28px_rgba(15,23,20,0.18)] sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="font-mono text-xs font-medium uppercase tracking-wider text-[var(--mkt-forest)]">
                        Stage {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="mt-2 font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-2xl">
                        {step.title}
                      </h3>
                    </div>
                    <step.icon
                      className="mt-1 size-6 shrink-0 text-[var(--mkt-forest)] md:hidden"
                      aria-hidden="true"
                    />
                  </div>

                  <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--mkt-body)]">
                    {step.description}
                  </p>

                  <ul className="mt-5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {step.details.map((detail) => (
                      <li key={detail} className="flex items-start gap-2.5">
                        <span
                          className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--mkt-forest)]"
                          aria-hidden="true"
                        />
                        <span className="text-sm leading-relaxed text-[var(--mkt-muted)]">
                          {detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
