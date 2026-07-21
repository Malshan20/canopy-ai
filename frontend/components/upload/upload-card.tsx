"use client";

import { AlertCircle } from "lucide-react";

import { useFileUpload } from "@/hooks/use-file-upload";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dropzone } from "@/components/upload/dropzone";
import { FilePreview } from "@/components/upload/file-preview";
import { ProcessingOverlay } from "@/components/upload/processing-overlay";
import { ErrorCard } from "@/components/shared/error-card";

/**
 * The fully functional first module of CanoryAI: select a ZIP, validate it
 * client-side, upload it to the FastAPI backend, watch the AI pipeline run,
 * and land on the results dashboard. Orchestration lives in `useFileUpload`
 * so this component stays a thin composition of presentational pieces.
 */
export function UploadCard() {
  const {
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
  } = useFileUpload();

  return (
    <Card className="w-full max-w-xl">
      <CardContent className="p-6">
        {phase === "processing" && (
          <ProcessingOverlay currentStepId={currentStepId} completedStepIds={completedStepIds} />
        )}

        {phase === "error" && apiError && (
          <ErrorCard error={apiError} onRetry={retry} />
        )}

        {phase === "idle" && (
          <div className="space-y-4">
            {selectedFile ? (
              <FilePreview
                file={selectedFile}
                declaredWeight={declaredWeight}
                weightError={weightError}
                onRemove={clearFile}
                onDeclaredWeightChange={setDeclaredWeight}
                onConfirm={startUpload}
              />
            ) : (
              <Dropzone
                isDragging={isDragging}
                onDraggingChange={setIsDragging}
                onFileSelected={selectFile}
              />
            )}

            {validationError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
