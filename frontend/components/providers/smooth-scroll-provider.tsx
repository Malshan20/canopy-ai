"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Lenis from "lenis";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { ScrollTrigger } from "@/lib/gsap";

/**
 * Wraps the marketing page in Lenis smooth scrolling. Deliberately
 * inert (renders a no-op passthrough) on touch devices and for
 * `prefers-reduced-motion` — Lenis's momentum scrolling fights native
 * touch scroll physics on phones more than it helps, and reduced-motion
 * users want the browser's default instant scroll, not a smoothed one.
 * Desktop mouse/trackpad scrolling is where this actually earns its
 * keep. Ties into GSAP's ScrollTrigger via `lenis.on("scroll", ...)` so
 * scroll-triggered reveals elsewhere on the page stay in sync with the
 * smoothed scroll position rather than the raw one.
 */
export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (isCoarsePointer) return; // native touch scrolling on phones/tablets

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    lenis.on("scroll", ScrollTrigger.update);

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [prefersReducedMotion]);

  return <>{children}</>;
}
