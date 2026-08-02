"use client";

import { motion, useReducedMotion as useFramerReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li";
}

/**
 * Fade-and-rise reveal triggered once when scrolled into view. Used for
 * every ordinary section entrance on the marketing page — GSAP is
 * reserved for the more choreographed moments (hero sequence, stat
 * counters, the bento grid's asymmetrical staggering) per this page's
 * documented motion-tool split. Automatically inert when the visitor
 * prefers reduced motion (renders children with no transform/opacity
 * animation at all, not just a faster version of one).
 */
export function Reveal({ children, delay = 0, y = 24, className, as = "div" }: RevealProps) {
  const prefersReducedMotion = useFramerReducedMotion();
  const Component = motion[as];

  if (prefersReducedMotion) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </Component>
  );
}
