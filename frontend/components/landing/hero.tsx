"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Satellite, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

import { gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarketingButton } from "@/components/landing/marketing-button";

const TRUST_INDICATORS = [
  { label: "AI Powered", icon: Sparkles },
  { label: "EUDR Ready", icon: ShieldCheck },
  { label: "Satellite Verified", icon: Satellite },
];

/**
 * The page's opening thesis, staged as a full-viewport scene: the product's
 * actual subject — forest canopy — is the backdrop, and the claim sits on
 * glass over it.
 *
 * Two constraints shaped this, and both are load-bearing:
 *
 * 1. `Navbar` renders transparent over the hero with dark ink text until the
 *    visitor scrolls, and this page's body copy is dark on light. The source
 *    footage is far too dark through its lower half to carry either, so the
 *    backdrop is always paired with the measured scrim below — see that block's
 *    comment for the actual luminance figures. Do not remove the scrim to "let
 *    the video breathe"; the text stops being readable.
 * 2. The video is served muted/looping with no audio track at all (stripped at
 *    encode, not just muted in markup) and re-encoded from 2.5MB to ~470KB MP4
 *    / ~280KB WebM, with a poster frame so something renders before it loads.
 *    Regenerate with frontend/scripts/build-forest-svg.js's sibling command in
 *    the README if the source is ever replaced.
 *
 * The compliance/satellite/DDS signal that previously floated beside a mock
 * window is preserved verbatim as the glass strip at the foot of the scene —
 * a centred layout has no side panel to hang it from, but the numbers are the
 * most concrete thing on the page and were kept rather than dropped.
 */
export function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion || !containerRef.current) return;

    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .from(".hero-eyebrow", { opacity: 0, y: 12, duration: 0.5 })
        .from(".hero-headline-line", { opacity: 0, y: 28, stagger: 0.09, duration: 0.7 }, "-=0.2")
        .from(".hero-sub", { opacity: 0, y: 16, duration: 0.6 }, "-=0.35")
        .from(".hero-cta", { opacity: 0, y: 16, duration: 0.5 }, "-=0.3")
        .from(".hero-trust", { opacity: 0, duration: 0.5, stagger: 0.06 }, "-=0.25")
        .from(".hero-stat", { opacity: 0, y: 18, duration: 0.6, stagger: 0.1 }, "-=0.3");
    }, containerRef);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-svh w-full flex-col overflow-hidden"
      aria-label="Introduction"
    >
      {/* Backdrop. Decorative only — the headline carries the meaning — so it is
          hidden from assistive tech rather than described twice.

          The scrim over the video is not a stylistic choice, it is load-bearing.
          Measured against the source footage, the raw frames run at roughly 205
          luminance across the top third but fall to ~133 mid-frame and ~65 at the
          bottom — so the headline would sit on mid-grey and the glass cards and
          trust row on near-black, both far below the ~180 needed for this page's
          dark ink to stay readable. The gradient below barely touches the already
          bright top, lifts the middle, and goes near-opaque at the foot, which
          measures back to 213 / 199 / 229. Its final stop is exactly
          var(--mkt-canvas), so the hero also dissolves into the next section with
          no horizontal seam — the same handoff the previous SVG backdrop did.

          Visitors who ask for reduced motion get the poster frame instead of an
          autoplaying loop; the scrim applies identically either way. */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {prefersReducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/videos/forest-hero-poster.jpg"
            alt=""
            className="size-full object-cover object-center"
          />
        ) : (
          <video
            className="size-full object-cover object-center"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/videos/forest-hero-poster.jpg"
          >
            <source src="/videos/forest-hero.webm" type="video/webm" />
            <source src="/videos/forest-hero.mp4" type="video/mp4" />
          </video>
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(247,249,247,0.10) 0%, rgba(247,249,247,0.30) 30%, rgba(247,249,247,0.55) 50%, rgba(247,249,247,0.80) 72%, rgba(247,249,247,0.95) 88%, rgba(247,249,247,1) 100%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pb-12 pt-32 text-center sm:px-8 sm:pt-36 lg:pt-40">
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="hero-eyebrow mb-7 inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-4 py-2 font-mono text-xs font-medium uppercase tracking-wider text-[var(--mkt-forest-deep)] shadow-sm backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-[var(--mkt-mint-glow)]" />
            EUDR compliance, automated
          </span>

          <h1 className="max-w-4xl font-[family-name:var(--font-instrument-serif)] text-[2.9rem] font-normal leading-[0.98] tracking-tight text-[var(--mkt-ink)] sm:text-6xl md:text-7xl lg:text-[5.25rem]">
            <span className="hero-headline-line block">The legal shield for</span>
            <span className="hero-headline-line block">global supply chains.</span>
          </h1>

          <p className="hero-sub mt-6 max-w-2xl text-sm leading-relaxed text-[var(--mkt-body)] sm:text-base md:text-lg">
            CanoryAI turns EUDR due diligence from a manual, error-prone paper chase into an
            automated pipeline — AI reads supplier documents, satellites verify every plot of land,
            and a defensible declaration is ready before your shipment reaches the border.
          </p>

          <div className="hero-cta mt-8">
            <MarketingButton href="/#demo" size="lg" icon={<ArrowRight className="size-4" />}>
              Book a Corporate Demo
            </MarketingButton>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
            {TRUST_INDICATORS.map((item) => (
              <div key={item.label} className="hero-trust flex items-center gap-2">
                <item.icon className="size-4 text-[var(--mkt-forest)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--mkt-muted)]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live-signal strip: the same three figures the previous hero floated
            beside the mock window, kept verbatim. */}
        <div className="mt-14 grid w-full max-w-4xl gap-3 sm:grid-cols-3">
          <div className="hero-stat rounded-2xl border border-white/70 bg-white/75 p-4 text-left shadow-[0_12px_36px_-18px_rgba(15,23,20,0.3)] backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--mkt-muted)]">Compliance score</span>
              <ShieldCheck className="size-3.5 text-[var(--mkt-forest)]" aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-[family-name:var(--font-manrope)] text-3xl font-semibold text-[var(--mkt-ink)]">
              98.4<span className="text-lg text-[var(--mkt-muted)]">%</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--mkt-mint)]/50">
              <div className="h-full w-[98%] rounded-full bg-[var(--mkt-forest)]" />
            </div>
          </div>

          <div className="hero-stat rounded-2xl border border-white/70 bg-white/75 p-4 text-left shadow-[0_12px_36px_-18px_rgba(15,23,20,0.3)] backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Satellite className="size-3.5 text-[var(--mkt-forest)]" aria-hidden="true" />
              <span className="text-xs font-medium text-[var(--mkt-muted)]">Satellite check</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-[var(--mkt-ink)]">1,204 plots verified</p>
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--mkt-mint)]/50 px-2 py-0.5 text-[11px] font-medium text-[var(--mkt-forest-deep)]">
              <span className="size-1.5 rounded-full bg-[var(--mkt-forest)]" />
              No deforestation detected
            </span>
          </div>

          <div className="hero-stat rounded-2xl border border-white/70 bg-white/75 p-4 text-left shadow-[0_12px_36px_-18px_rgba(15,23,20,0.3)] backdrop-blur-md">
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
