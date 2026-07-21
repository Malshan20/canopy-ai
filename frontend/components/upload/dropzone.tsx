"use client";

import { useCallback, useRef, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";
import { ACCEPTED_FILE_EXTENSION, MAX_UPLOAD_SIZE_LABEL } from "@/constants/upload";
import { Button } from "@/components/ui/button";

interface DropzoneProps {
  isDragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onFileSelected: (file: File) => void;
}

/**
 * Drag-and-drop + click-to-browse target for ZIP uploads. Purely
 * presentational and input-handling — validation and state live in
 * `useFileUpload`.
 */
export function Dropzone({ isDragging, onDraggingChange, onFileSelected }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!isDragging) onDraggingChange(true);
    },
    [isDragging, onDraggingChange],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDraggingChange(false);
    },
    [onDraggingChange],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      onDraggingChange(false);
      const file = event.dataTransfer.files?.[0];
      if (file) onFileSelected(file);
    },
    [onDraggingChange, onFileSelected],
  );

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) onFileSelected(file);
      event.target.value = "";
    },
    [onFileSelected],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a ZIP archive by dragging it here or browsing your files"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBrowseClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleBrowseClick();
        }
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDragging
          ? "border-primary bg-accent"
          : "border-border bg-muted/30 hover:border-forest-200 hover:bg-accent/50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_FILE_EXTENSION}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
        <UploadCloud className="size-8 text-primary" aria-hidden="true" />
      </div>

      <h3 className="text-base font-semibold text-foreground">
        Drag and drop your ZIP archive here
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Upload a ZIP archive containing supplier receipts, scanned documents, or PDFs.
      </p>

      <Button
        type="button"
        variant="outline"
        className="mt-6"
        onClick={(event) => {
          event.stopPropagation();
          handleBrowseClick();
        }}
      >
        Browse files
      </Button>

      <p className="mt-4 text-xs text-muted-foreground">
        Accepted format: ZIP only · Maximum size: {MAX_UPLOAD_SIZE_LABEL}
      </p>
    </div>
  );
}
