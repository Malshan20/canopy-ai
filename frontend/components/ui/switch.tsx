"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}

/**
 * A minimal, dependency-free toggle switch — no Radix primitive for this
 * exists in the project yet, and pulling one in for a single control
 * wasn't worth a new dependency. Standard `role="switch"` pattern:
 * keyboard-operable (Enter/Space via native <button>), aria-checked
 * reflects state for screen readers.
 */
export function Switch({ checked, onCheckedChange, disabled, id, "aria-label": ariaLabel }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 transform rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-1",
        )}
      />
    </button>
  );
}
