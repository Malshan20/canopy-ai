"use client";

import { useEffect } from "react";
import type { RefObject } from "react";

/** Calls `handler` when a pointer event occurs outside `ref`'s element. */
export function useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
): void {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const el = ref.current;
      if (!el || el.contains(event.target as Node)) return;
      handler();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [ref, handler]);
}
