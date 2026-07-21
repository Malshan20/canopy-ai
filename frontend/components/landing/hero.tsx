"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Satellite, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarketingButton } from "@/components/landing/marketing-button";
import { VerificationWindow } from "@/components/landing/verification-window";

const TRUST_INDICATORS = [
  { label: "AI Powered", icon: Sparkles },
  { label: "EUDR Ready", icon: ShieldCheck },
  { label: "Satellite Verified", icon: Satellite },
];

/**
 * The page's opening thesis: a single, confident claim ("The Legal Shield
 * for Global Supply Chains") backed immediately by a visualization of the
 * actual product signal — compliance score, satellite status, AI
 * confidence — rather than an abstract hero illustration. GSAP drives the
 * entrance choreography on mount (word-by-word headline reveal, staggered
 * card entrance); everything after this section uses the lighter
 * Framer Motion `<Reveal>` wrapper instead — see that component's
 * docstring for the reasoning.
 */
export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !containerRef.current) return;

    const ctx = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });

      timeline
        .from(".hero-eyebrow", { opacity: 0, y: 12, duration: 0.5 })
        .from(".hero-headline-line", { opacity: 0, y: 28, stagger: 0.09, duration: 0.7 }, "-=0.2")
        .from(".hero-sub", { opacity: 0, y: 16, duration: 0.6 }, "-=0.35")
        .from(".hero-cta", { opacity: 0, y: 16, duration: 0.5, stagger: 0.08 }, "-=0.3")
        .from(".hero-trust", { opacity: 0, duration: 0.5, stagger: 0.06 }, "-=0.25")
        .from(
          ".hero-visual",
          { opacity: 0, scale: 0.96, duration: 0.9, ease: "power2.out" },
          "-=0.7",
        )
        .from(
          ".hero-float-card",
          { opacity: 0, y: 14, duration: 0.6, stagger: 0.12, ease: "back.out(1.4)" },
          "-=0.5",
        )
        // Once the entrance settles, the floating cards keep a slow, offset
        // drift — enough that the visual reads as live telemetry rather than
        // a static screenshot, quiet enough not to fight the copy.
        .add(() => {
          gsap.to(".hero-float-card", {
            y: "-=7",
            duration: 3.2,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            stagger: { each: 0.55, from: "random" },
          });
        });
    }, containerRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section ref={containerRef} className="relative overflow-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
      {/* Ambient backdrop: soft radial mint glow, a faint counter-glow on the
          visual side, and a dot grid that fades out before the fold — depth
          without becoming a loud gradient. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]"
        style={{
          background:
            "radial-gradient(720px circle at 20% 10%, rgba(183,240,214,0.35), transparent 60%), radial-gradient(560px circle at 85% 30%, rgba(11,110,79,0.07), transparent 65%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          backgroundImage: "radial-gradient(rgba(11,110,79,0.14) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent 85%)",
        }}
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl gap-16 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-10">
        <div>
          <span className="hero-eyebrow mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--mkt-border)] bg-white px-3.5 py-1.5 font-mono text-xs font-medium uppercase tracking-wider text-[var(--mkt-forest)]">
            <span className="size-1.5 rounded-full bg-[var(--mkt-mint-glow)]" />
            EUDR compliance, automated
          </span>

          <h1 className="max-w-xl font-[family-name:var(--font-manrope)] text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-[var(--mkt-ink)] sm:text-6xl lg:text-[3.75rem]">
            <span className="hero-headline-line block">The legal shield for</span>
            <span className="hero-headline-line block">global supply chains.</span>
          </h1>

          <p className="hero-sub mt-6 max-w-lg text-lg leading-relaxed text-[var(--mkt-body)]">
            CanoryAI turns EUDR due diligence from a manual, error-prone paper chase into an
            automated pipeline — AI reads supplier documents, satellites verify every plot of
            land, and a defensible declaration is ready before your shipment reaches the border.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="hero-cta">
              <MarketingButton href="/#demo" size="lg" icon={<ArrowRight className="size-4" />}>
                Book a Corporate Demo
              </MarketingButton>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3">
            {TRUST_INDICATORS.map((item) => (
              <div key={item.label} className="hero-trust flex items-center gap-2">
                <item.icon className="size-4 text-[var(--mkt-forest)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--mkt-muted)]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero visual: the world-map verification window as an atmospheric base,
            with floating compliance UI cards overlaid — the "conceptual interface"
            the brief asks for, rendered as real coded UI rather than a static mock. */}
        <div className="hero-visual relative mx-auto aspect-[4/5] w-full max-w-md lg:max-w-none">
          <VerificationWindow
            src="/images/landing/global-supply-map.jpg"
            alt="Global supply chain network visualized as a satellite data grid"
            label="Global coverage · live"
            priority
            className="h-full w-full"
          />

          <div className="hero-float-card absolute -left-4 top-8 w-[188px] rounded-2xl border border-[var(--mkt-border)] bg-white/95 p-4 shadow-[0_20px_50px_-16px_rgba(15,23,20,0.25)] backdrop-blur sm:-left-8 sm:top-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--mkt-muted)]">Compliance score</span>
              <ShieldCheck className="size-3.5 text-[var(--mkt-forest)]" aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-[family-name:var(--font-manrope)] text-3xl font-semibold text-[var(--mkt-ink)]">
              98.4<span className="text-lg text-[var(--mkt-muted)]">%</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--mkt-mint)]/40">
              <div className="h-full w-[98%] rounded-full bg-[var(--mkt-forest)]" />
            </div>
          </div>

          <div className="hero-float-card absolute -right-4 top-1/3 w-[172px] rounded-2xl border border-[var(--mkt-border)] bg-white/95 p-4 shadow-[0_20px_50px_-16px_rgba(15,23,20,0.25)] backdrop-blur sm:-right-8">
            <div className="flex items-center gap-2">
              <Satellite className="size-3.5 text-[var(--mkt-forest)]" aria-hidden="true" />
              <span className="text-xs font-medium text-[var(--mkt-muted)]">Satellite check</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-[var(--mkt-ink)]">
              1,204 plots verified
            </p>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--mkt-mint)]/50 px-2 py-0.5 text-[11px] font-medium text-[var(--mkt-forest-deep)]">
              <span className="size-1.5 rounded-full bg-[var(--mkt-forest)]" />
              No deforestation detected
            </span>
          </div>

          <div className="hero-float-card absolute -bottom-5 left-1/2 w-[210px] -translate-x-1/2 rounded-2xl border border-[var(--mkt-border)] bg-white/95 p-4 shadow-[0_20px_50px_-16px_rgba(15,23,20,0.25)] backdrop-blur sm:bottom-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--mkt-muted)]">Shipment SH-2291</span>
              <TrendingUp className="size-3.5 text-[var(--mkt-forest)]" aria-hidden="true" />
            </div>
            <p className="mt-1.5 text-sm font-semibold text-[var(--mkt-ink)]">DDS generated</p>
            <p className="mt-0.5 text-xs text-[var(--mkt-muted)]">Schema-accurate, ready to review</p>
          </div>
        </div>
      </div>
    </section>
  );
}
