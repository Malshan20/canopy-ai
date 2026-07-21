import { cn } from "@/lib/utils";

/** Small mono-set label above a section headline — e.g. "VERIFICATION". */
export function SectionEyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.14em] text-[var(--mkt-forest)]",
        className,
      )}
    >
      <span className="h-px w-6 bg-[var(--mkt-forest)]/50" aria-hidden="true" />
      {children}
    </span>
  );
}
