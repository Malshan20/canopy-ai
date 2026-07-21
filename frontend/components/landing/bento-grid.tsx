"use client";

import { useEffect, useRef } from "react";
import { FileCode2, FileScan, ScanLine, Shield, CheckCircle2 } from "lucide-react";

import { ensureGsapRegistered, gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Reveal } from "@/components/landing/reveal";
import { SectionEyebrow } from "@/components/landing/section-eyebrow";
import { VerificationWindow } from "@/components/landing/verification-window";

const AUDIT_EVENTS = [
  { label: "AI extraction", detail: "96% confidence" },
  { label: "Satellite check", detail: "Plot verified clean" },
  { label: "XML generated", detail: "Ready for TRACES NT" },
];

const XML_LINES: { indent: number; content: React.ReactNode }[] = [
  { indent: 0, content: <span className="text-[#7dd3ac]">{"<dds:DDSubmission>"}</span> },
  { indent: 1, content: <span className="text-[#7dd3ac]">{"<dds:Operator>"}</span> },
  {
    indent: 2,
    content: (
      <>
        <span className="text-[#8fa89e]">{"<dds:EORI>"}</span>
        <span className="text-white">NL8023145</span>
        <span className="text-[#8fa89e]">{"</dds:EORI>"}</span>
      </>
    ),
  },
  { indent: 1, content: <span className="text-[#7dd3ac]">{"</dds:Operator>"}</span> },
  { indent: 1, content: <span className="text-[#7dd3ac]">{"<dds:Commodity>"}</span> },
  {
    indent: 2,
    content: (
      <>
        <span className="text-[#8fa89e]">{"<dds:Description>"}</span>
        <span className="text-white">Cocoa beans</span>
        <span className="text-[#8fa89e]">{"</dds:Description>"}</span>
      </>
    ),
  },
  {
    indent: 2,
    content: (
      <>
        <span className="text-[#8fa89e]">{"<dds:NetWeight unit="}</span>
        <span className="text-[#f0c987]">&quot;kg&quot;</span>
        <span className="text-[#8fa89e]">{">"}</span>
        <span className="text-white">18400</span>
        <span className="text-[#8fa89e]">{"</dds:NetWeight>"}</span>
      </>
    ),
  },
  { indent: 1, content: <span className="text-[#7dd3ac]">{"</dds:Commodity>"}</span> },
  { indent: 1, content: <span className="text-[#7dd3ac]">{"<dds:RiskAssessment>"}</span> },
  {
    indent: 2,
    content: (
      <>
        <span className="text-[#8fa89e]">{"<dds:Risk>"}</span>
        <span className="text-white">negligible</span>
        <span className="text-[#8fa89e]">{"</dds:Risk>"}</span>
      </>
    ),
  },
  { indent: 1, content: <span className="text-[#7dd3ac]">{"</dds:RiskAssessment>"}</span> },
  { indent: 0, content: <span className="text-[#7dd3ac]">{"</dds:DDSubmission>"}</span> },
];

/**
 * Product bento grid — four features, each proven with either the actual
 * output shape (the XML card renders real DDS element names this
 * platform generates, not placeholder tags) or a `VerificationWindow`
 * photographic panel. GSAP staggers the four cards in as a group on
 * scroll, distinct from the individual-card `<Reveal>` treatment used
 * elsewhere, since a bento grid's four cells reading as one coordinated
 * entrance is part of what makes it feel like a considered layout rather
 * than four independent boxes.
 */
export function BentoGrid() {
  const gridRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !gridRef.current) return;
    ensureGsapRegistered();

    const ctx = gsap.context(() => {
      gsap.from(".bento-card", {
        opacity: 0,
        y: 32,
        duration: 0.7,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: gridRef.current, start: "top 78%", once: true },
      });
    }, gridRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section id="platform" className="border-t border-[var(--mkt-border)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <Reveal>
          <SectionEyebrow>The platform</SectionEyebrow>
          <h2 className="mt-4 max-w-xl font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            Four systems, one defensible declaration.
          </h2>
        </Reveal>

        <div
          ref={gridRef}
          className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 lg:[grid-auto-rows:280px]"
        >
          {/* AI Document Extraction — wide + tall */}
          <div className="bento-card rounded-3xl border border-[var(--mkt-border)] bg-white p-7 sm:col-span-2 lg:col-span-2 lg:row-span-2">
            <div className="flex items-center gap-2.5">
              <FileScan className="size-5 text-[var(--mkt-forest)]" aria-hidden="true" />
              <h3 className="text-base font-semibold text-[var(--mkt-ink)]">AI document extraction</h3>
            </div>
            <p className="mt-2.5 max-w-md text-sm leading-relaxed text-[var(--mkt-muted)]">
              Vision AI reads handwritten weighbridge receipts, GPS slips, and supplier invoices
              from remote regions — no template, no fixed layout — and returns structured,
              auditable data in seconds.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <VerificationWindow
                src="/images/landing/ai-extraction-core.jpg"
                alt="AI extraction model processing supplier document data"
                label="Model active"
                className="h-40 w-full sm:h-full"
              />

              <div className="relative overflow-hidden rounded-2xl bg-[#0b120f] p-4">
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-white/50">
                  Extracted JSON
                </span>
                <pre className="mt-3 overflow-hidden font-mono text-[11px] leading-relaxed text-[#7dd3ac]">
{`{
  "farmer": "A. Kessé",
  "crop_weight_kg": 1840,
  "gps": "5.34N, 3.98W",
  "confidence": 0.96
}`}
                </pre>
              </div>
            </div>
          </div>

          {/* Satellite Verification — wide */}
          <div className="bento-card relative overflow-hidden rounded-3xl border border-[var(--mkt-border)] bg-white p-7 sm:col-span-2 lg:col-span-2 lg:row-span-1">
            <div className="flex items-center gap-2.5">
              <ScanLine className="size-5 text-[var(--mkt-forest)]" aria-hidden="true" />
              <h3 className="text-base font-semibold text-[var(--mkt-ink)]">Satellite verification</h3>
            </div>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--mkt-muted)]">
              Every GPS coordinate is checked against Global Forest Watch tree-cover-loss data
              back to the regulation&apos;s 2020 cutoff.
            </p>
            <VerificationWindow
              src="/images/landing/satellite-verification.jpg"
              alt="Satellite radar overlay verifying forest plot boundaries for deforestation risk"
              label="Plot scan · clean"
              className="mt-5 h-32 w-full sm:h-36"
            />
          </div>

          {/* Immutable Audit Vault */}
          <div id="security" className="bento-card scroll-mt-24 overflow-hidden rounded-3xl border border-[var(--mkt-border)] bg-white p-7">
            <div className="flex items-center gap-2.5">
              <Shield className="size-5 text-[var(--mkt-forest)]" aria-hidden="true" />
              <h3 className="text-base font-semibold text-[var(--mkt-ink)]">Immutable audit vault</h3>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--mkt-muted)]">
              Append-only by database design — enforced at the row level, not just the UI.
            </p>
            <VerificationWindow
              src="/images/landing/audit-vault.jpg"
              alt="Secure infrastructure representing the append-only audit ledger"
              label="Ledger · sealed"
              className="mt-3 h-16 w-full"
            />
            <ol className="mt-3 space-y-1.5">
              {AUDIT_EVENTS.map((event) => (
                <li key={event.label} className="flex items-center gap-2">
                  <CheckCircle2 className="size-3 shrink-0 text-[var(--mkt-forest)]" aria-hidden="true" />
                  <p className="text-[11px]">
                    <span className="font-semibold text-[var(--mkt-ink)]">{event.label}</span>
                    <span className="text-[var(--mkt-muted)]"> — {event.detail}</span>
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {/* TRACES NT XML Generator */}
          <div className="bento-card overflow-hidden rounded-3xl border border-[var(--mkt-border)] bg-[#0b120f] p-0">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="ml-2 flex items-center gap-1.5 font-mono text-[11px] text-white/50">
                <FileCode2 className="size-3" aria-hidden="true" />
                dds_export.xml
              </span>
            </div>
            <pre className="overflow-hidden px-4 py-3 font-mono text-[10.5px] leading-relaxed">
              {XML_LINES.map((line, i) => (
                <div key={i} style={{ paddingLeft: `${line.indent * 12}px` }}>
                  {line.content}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
