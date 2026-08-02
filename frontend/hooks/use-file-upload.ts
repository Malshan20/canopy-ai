"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { uploadShipmentZip } from "@/services/api";
import { useShipmentStore } from "@/hooks/use-shipment-store";
import { validateDeclaredWeight, validateUploadFile } from "@/lib/validate-upload";
import { PROCESSING_STEPS, type ProcessingStepId } from "@/constants/upload";
import type { ApiError } from "@/types/api";

const STEP_ADVANCE_INTERVAL_MS = 900;

export type UploadPhase = "idle" | "processing" | "error";

interface UseFileUploadResult {
  selectedFile: File | null;
  validationError: string | null;
  declaredWeight: string;
  weightError: string | null;
  isDragging: boolean;
  phase: UploadPhase;
  currentStepId: ProcessingStepId | null;
  completedStepIds: ProcessingStepId[];
  apiError: ApiError | null;
  selectFile: (file: File) => void;
  clearFile: () => void;
  setDeclaredWeight: (value: string) => void;
  setIsDragging: (dragging: boolean) => void;
  startUpload: () => Promise<void>;
  retry: () => Promise<void>;
}

/**
 * Encapsulates the entire upload lifecycle: client-side validation,
 * drag state, the declared-weight input (used for mass balance
 * validation), the simulated multi-step processing experience, the actual
 * API call, and success/error transitions (including navigation to the
 * results dashboard on success).
 */
export function useFileUpload(): UseFileUploadResult {
  const router = useRouter();
  const { save } = useShipmentStore();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [declaredWeight, setDeclaredWeight] = useState("");
  const [weightError, setWeightError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearStepTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => clearStepTimer, [clearStepTimer]);

  const selectFile = useCallback((file: File) => {
    const result = validateUploadFile(file);
    if (!result.valid) {
      setValidationError(result.message ?? "This file can't be uploaded.");
      setSelectedFile(null);
      return;
    }
    setValidationError(null);
    setSelectedFile(file);
  }, []);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setValidationError(null);
    setDeclaredWeight("");
    setWeightError(null);
    setPhase("idle");
    setStepIndex(0);
    setApiError(null);
    clearStepTimer();
  }, [clearStepTimer]);

  const runUpload = useCallback(
    async (file: File, weightKg: number) => {
      setPhase("processing");
      setApiError(null);
      setStepIndex(0);
      startTimeRef.current = performance.now();

      // Advance through the illustrative processing steps while the single
      // backend request is in flight. Stops one step short of the end so
      // the UI never claims "finalizing" before the response actually
      // arrives.
      intervalRef.current = setInterval(() => {
        setStepIndex((current) => {
          const nextIndex = current + 1;
          return nextIndex >= PROCESSING_STEPS.length - 1 ? current : nextIndex;
        });
      }, STEP_ADVANCE_INTERVAL_MS);

      const result = await uploadShipmentZip(file, weightKg);
      clearStepTimer();

      const elapsedSeconds = (performance.now() - startTimeRef.current) / 1000;

      if (!result.ok) {
        setApiError(result.error);
        setPhase("error");
        toast.error("Upload failed", { description: result.error.message });
        return;
      }

      setStepIndex(PROCESSING_STEPS.length - 1);
      save(result.data, file.name, elapsedSeconds);

      const { readiness } = result.data.compliance;
      if (readiness === "blocked") {
        toast.error("Compliance check blocked", {
          description: "Critical issues were found — review the results before submission.",
        });
      } else if (readiness === "needs_review") {
        toast.warning("Analysis complete — review needed", {
          description: `${result.data.documents_processed} document(s) processed. Some items need review.`,
        });
      } else {
        toast.success("Analysis complete", {
          description: `${result.data.documents_processed} document(s) processed.`,
        });
      }

      // Brief pause so the final "Finalizing" step is visible before
      // navigating away.
      setTimeout(() => {
        router.push(`/shipments/${result.data.shipment_id}`);
      }, 600);
    },
    [clearStepTimer, router, save],
  );

  const startUpload = useCallback(async () => {
    if (!selectedFile) return;

    const weightValidation = validateDeclaredWeight(declaredWeight);
    if (!weightValidation.valid) {
      setWeightError(weightValidation.message ?? "Enter a valid declared weight.");
      return;
    }
    setWeightError(null);

    await runUpload(selectedFile, Number(declaredWeight));
  }, [declaredWeight, runUpload, selectedFile]);

  const retry = useCallback(async () => {
    if (!selectedFile) return;
    const weightValidation = validateDeclaredWeight(declaredWeight);
    if (!weightValidation.valid) return;
    await runUpload(selectedFile, Number(declaredWeight));
  }, [declaredWeight, runUpload, selectedFile]);

  const currentStepId = phase === "processing" || phase === "error"
    ? (PROCESSING_STEPS[stepIndex]?.id ?? null)
    : null;

  const completedStepIds = PROCESSING_STEPS.slice(0, stepIndex).map((step) => step.id);

  return {
    selectedFile,
    validationError,
    declaredWeight,
    weightError,
    isDragging,
    phase,
    currentStepId,
    completedStepIds,
    apiError,
    selectFile,
    clearFile,
    setDeclaredWeight,
    setIsDragging,
    startUpload,
    retry,
  };
}
