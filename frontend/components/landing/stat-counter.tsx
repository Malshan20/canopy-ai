"use client";

import { useEffect, useRef } from "react";

import { ensureGsapRegistered, gsap } from "@/lib/gsap";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface StatCounterProps {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

/**
 * Counts up from 0 to `value` once the number scrolls into view, via a
 * GSAP-tweened proxy object (not a React state update per frame — that
 * would re-render on every tick). Renders the final value immediately,
 * with no animation, for reduced-motion visitors.
 */
export function StatCounter({ value, decimals = 0, suffix = "", prefix = "", className }: StatCounterProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    if (prefersReducedMotion) {
      el.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
      return;
    }

    ensureGsapRegistered();
    const proxy = { current: 0 };

    const tween = gsap.to(proxy, {
      current: value,
      duration: 1.6,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        once: true,
      },
      onUpdate: () => {
        el.textContent = `${prefix}${proxy.current.toFixed(decimals)}${suffix}`;
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [value, decimals, suffix, prefix, prefersReducedMotion]);

  return (
    <span ref={spanRef} className={className}>
      {prefix}
      {(0).toFixed(decimals)}
      {suffix}
    </span>
  );
}
