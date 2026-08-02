import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** Set false for full-bleed layouts like the centered upload page. */
  constrained?: boolean;
}

export function PageContainer({
  children,
  className,
  constrained = true,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "px-4 py-8 md:px-8",
        constrained && "mx-auto w-full max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
