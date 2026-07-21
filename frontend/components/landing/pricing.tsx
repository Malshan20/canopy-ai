"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { SectionEyebrow } from "@/components/landing/section-eyebrow";
import { MarketingButton } from "@/components/landing/marketing-button";
import { cn } from "@/lib/utils";

interface PlanLimit {
  label: string;
  value: string;
}

interface Plan {
  name: string;
  annualPrice: number;
  monthlyPrice: number;
  description: string;
  features: string[];
  limits: PlanLimit[];
  recommended?: boolean;
  custom?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Growth",
    annualPrice: 12000,
    monthlyPrice: 1500,
    description: "For importers running their first automated compliance season.",
    features: [
      "250 shipments per year",
      "AI OCR document extraction",
      "Satellite deforestation checks",
      "TRACES NT XML generation",
      "Immutable audit logs",
    ],
    limits: [
      { label: "Team members", value: "Up to 5" },
      { label: "Documents per shipment", value: "Up to 25" },
      { label: "Max file size", value: "25 MB" },
      { label: "Support response time", value: "48 hours (email)" },
    ],
  },
  {
    name: "Enterprise",
    annualPrice: 38000,
    monthlyPrice: 3600,
    description: "For teams running compliance across multiple commodities and regions.",
    features: [
      "Everything in Growth",
      "1,000 shipments per year",
      "API access",
      "Dedicated Customer Success Manager",
      "Webhooks for custom integrations",
      "Priority processing",
    ],
    limits: [
      { label: "Team members", value: "Up to 25" },
      { label: "Documents per shipment", value: "Up to 100" },
      { label: "Max file size", value: "100 MB" },
      { label: "API rate limit", value: "60 requests / minute" },
      { label: "Support response time", value: "4 hours (priority)" },
    ],
    recommended: true,
  },
  {
    name: "Custom",
    annualPrice: 80000,
    monthlyPrice: 7000,
    description: "For global commodity traders operating at unlimited scale.",
    features: [
      "Unlimited shipment volume",
      "Dedicated infrastructure",
      "Custom SLAs",
      "White-glove supplier onboarding",
      "Enterprise support",
    ],
    limits: [
      { label: "Team members", value: "Unlimited" },
      { label: "Documents per shipment", value: "Unlimited" },
      { label: "Max file size", value: "Negotiated per contract" },
      { label: "API rate limit", value: "Negotiated per contract" },
      { label: "Support response time", value: "24/7 dedicated line" },
    ],
    custom: true,
  },
];

/**
 * Three tiers, one obvious recommendation. Annual and monthly are each
 * explicit, published figures (not a computed annual ÷ 12) — monthly
 * billing carries a small premium over the annual-equivalent rate, which
 * is standard and worth stating plainly rather than implying they're the
 * same deal on a different clock. The billing toggle defaults to annual
 * per the brief.
 */
export function Pricing() {
  const [isAnnual, setIsAnnual] = useState(true);

  return (
    <section id="pricing" className="border-t border-[var(--mkt-border)] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <Reveal className="text-center">
          <SectionEyebrow className="justify-center">Pricing</SectionEyebrow>
          <h2 className="mx-auto mt-4 max-w-xl font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-4xl">
            Enterprise pricing, built around shipment volume.
          </h2>

          <div className="mx-auto mt-8 inline-flex items-center gap-1 rounded-full border border-[var(--mkt-border)] bg-white p-1">
            {(["annual", "monthly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setIsAnnual(option === "annual")}
                aria-pressed={option === "annual" ? isAnnual : !isAnnual}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  (option === "annual") === isAnnual
                    ? "text-white"
                    : "text-[var(--mkt-muted)] hover:text-[var(--mkt-ink)]",
                )}
              >
                {(option === "annual") === isAnnual && (
                  <motion.span
                    layoutId="pricing-toggle-pill"
                    className="absolute inset-0 rounded-full bg-[var(--mkt-forest)]"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">
                  {option === "annual" ? "Billed annually" : "Billed monthly"}
                </span>
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.name} delay={index * 0.08}>
              <div
                className={cn(
                  "flex h-full flex-col rounded-3xl border p-8",
                  plan.recommended
                    ? "border-[var(--mkt-forest)] bg-[var(--mkt-ink)] text-white shadow-[0_30px_70px_-24px_rgba(11,110,79,0.5)]"
                    : "border-[var(--mkt-border)] bg-white",
                )}
              >
                {plan.recommended && (
                  <span className="mb-4 inline-flex w-fit items-center rounded-full bg-[var(--mkt-mint)] px-3 py-1 text-xs font-semibold text-[var(--mkt-forest-deep)]">
                    Recommended
                  </span>
                )}

                <h3 className={cn("text-lg font-semibold", plan.recommended ? "text-white" : "text-[var(--mkt-ink)]")}>
                  {plan.name}
                </h3>
                <p className={cn("mt-1.5 text-sm", plan.recommended ? "text-white/70" : "text-[var(--mkt-muted)]")}>
                  {plan.description}
                </p>

                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-manrope)] text-4xl font-semibold tracking-tight">
                    ${(isAnnual ? plan.annualPrice : plan.monthlyPrice).toLocaleString()}
                    {plan.custom && "+"}
                  </span>
                  <span className={cn("text-sm", plan.recommended ? "text-white/60" : "text-[var(--mkt-muted)]")}>
                    {isAnnual ? "/year" : "/month"}
                  </span>
                </div>

                <ul className="mt-7 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          plan.recommended ? "text-[var(--mkt-mint)]" : "text-[var(--mkt-forest)]",
                        )}
                        aria-hidden="true"
                      />
                      <span className={plan.recommended ? "text-white/85" : "text-[var(--mkt-body)]"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Plan limits — deliberately separate from the feature checklist above:
                    features are "what you get", limits are "how much of it" — audit log
                    retention is NOT one of these, since it's indefinite on every tier
                    (see the FAQ's audit-retention answer), not a paid differentiator. */}
                <div
                  className={cn(
                    "mt-6 flex-1 border-t pt-6",
                    plan.recommended ? "border-white/15" : "border-[var(--mkt-border)]",
                  )}
                >
                  <p
                    className={cn(
                      "font-mono text-[10px] font-medium uppercase tracking-wider",
                      plan.recommended ? "text-white/50" : "text-[var(--mkt-muted)]",
                    )}
                  >
                    Plan limits
                  </p>
                  <dl className="mt-3 space-y-2">
                    {plan.limits.map((limit) => (
                      <div key={limit.label} className="flex items-baseline justify-between gap-3 text-xs">
                        <dt className={plan.recommended ? "text-white/60" : "text-[var(--mkt-muted)]"}>
                          {limit.label}
                        </dt>
                        <dd
                          className={cn(
                            "text-right font-medium",
                            plan.recommended ? "text-white" : "text-[var(--mkt-ink)]",
                          )}
                        >
                          {limit.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <MarketingButton
                  href="/#demo"
                  variant={plan.recommended ? "primary" : "secondary"}
                  size="lg"
                  className={cn("mt-8 w-full", plan.recommended && "!bg-white !text-[var(--mkt-ink)] hover:!bg-[var(--mkt-mint)]")}
                >
                  {plan.custom ? "Contact sales" : "Book a demo"}
                </MarketingButton>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
