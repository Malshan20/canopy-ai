"use client";

import { Check, Loader2 } from "lucide-react";

import { PROCESSING_STEPS, type ProcessingStepId } from "@/constants/upload";
import { cn } from "@/lib/utils";

interface ProcessingOverlayProps {
  currentStepId: ProcessingStepId | null;
  completedStepIds: ProcessingStepId[];
}

/**
 * Replaces the upload card while a shipment is being analyzed. The vertical
 * checklist with a growing connector line is CanoryAI's signature moment —
 * a quiet nod to the product's canopy/growth metaphor without resorting to
 * literal iconography. Steps are illustrative of the real backend pipeline
 * (see `app/services/shipment_processor.py`) since the API itself returns a
 * single response rather than progress events.
 */
export function ProcessingOverlay({ currentStepId, completedStepIds }: ProcessingOverlayProps) {
  const currentIndex = PROCESSING_STEPS.findIndex((step) => step.id === currentStepId);

  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <div className="mb-8 text-center">
        <h3 className="text-base font-semibold text-foreground">
          CanoryAI is analyzing your supplier documents using AI…
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This usually takes under a minute, depending on archive size.
        </p>
      </div>

      <ol className="relative mx-auto max-w-sm">
        {PROCESSING_STEPS.map((step, index) => {
          const isComplete = completedStepIds.includes(step.id);
          const isCurrent = step.id === currentStepId;
          const isLast = index === PROCESSING_STEPS.length - 1;

          return (
            <li key={step.id} className="relative flex gap-4 pb-7 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[15px] top-8 h-full w-px transition-colors duration-500",
                    isComplete ? "bg-primary" : "bg-border",
                  )}
                />
              )}

              <span
                className={cn(
                  "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-300",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isCurrent &&
                    !isComplete &&
                    "border-primary bg-primary/10 text-primary",
                  !isComplete && !isCurrent && "border-border bg-muted text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>

              <span
                className={cn(
                  "pt-1 text-sm transition-colors duration-300",
                  isComplete && "font-medium text-foreground",
                  isCurrent && !isComplete && "font-medium text-foreground",
                  !isComplete && !isCurrent && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <span className="sr-only" role="status" aria-live="polite">
        {currentIndex >= 0
          ? `Step ${currentIndex + 1} of ${PROCESSING_STEPS.length}: ${PROCESSING_STEPS[currentIndex]?.label}`
          : "Starting analysis"}
      </span>
    </div>
  );
}
