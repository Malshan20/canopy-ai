"use client";

import { FileArchive, Scale, X } from "lucide-react";

import { formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FilePreviewProps {
  file: File;
  declaredWeight: string;
  weightError: string | null;
  onRemove: () => void;
  onDeclaredWeightChange: (value: string) => void;
  onConfirm: () => void;
}

/**
 * Shown once a valid ZIP has been selected but before upload starts.
 * Confirms exactly what will be sent, collects the shipment's declared
 * weight (required for mass balance validation), and surfaces the primary
 * CTA.
 */
export function FilePreview({
  file,
  declaredWeight,
  weightError,
  onRemove,
  onDeclaredWeightChange,
  onConfirm,
}: FilePreviewProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent">
          <FileArchive className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove selected file"
          onClick={onRemove}
        >
          <X />
        </Button>
      </div>

      <div className="mt-5">
        <Label htmlFor="declared-weight" className="flex items-center gap-1.5">
          <Scale className="size-3.5 text-muted-foreground" aria-hidden="true" />
          Total declared shipment weight (kg)
        </Label>
        <Input
          id="declared-weight"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder="e.g. 12500"
          value={declaredWeight}
          onChange={(event) => onDeclaredWeightChange(event.target.value)}
          aria-invalid={weightError ? "true" : "false"}
          aria-describedby={weightError ? "declared-weight-error" : undefined}
          className="mt-1.5"
        />
        {weightError ? (
          <p id="declared-weight-error" className="mt-1.5 text-xs text-danger">
            {weightError}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Used to validate extracted receipt weights against the declared total.
          </p>
        )}
      </div>

      <Button type="button" size="lg" className="mt-5 w-full" onClick={onConfirm}>
        Upload &amp; Analyze
      </Button>
    </div>
  );
}
