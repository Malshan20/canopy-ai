"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `prefers-reduced-motion` live (not just at mount) — every
 * animation-driving component on the marketing page (GSAP, Framer Motion,
 * Lenis) reads this before deciding whether to run, per the WCAG 2.2
 * requirement and this page's own accessibility bar.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (event: MediaQueryListEvent) => setPrefersReduced(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return prefersReduced;
}
