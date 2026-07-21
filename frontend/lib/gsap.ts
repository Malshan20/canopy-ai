"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/**
 * Registers GSAP's ScrollTrigger plugin exactly once, no matter how many
 * components call this on mount. Client-only (GSAP touches the DOM at
 * import time in ways that don't tolerate SSR).
 */
export function ensureGsapRegistered() {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export { gsap, ScrollTrigger };
