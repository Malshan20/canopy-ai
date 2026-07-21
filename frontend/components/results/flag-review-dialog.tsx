"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";

import { flagDocument } from "@/services/api";
import type { DocumentResult } from "@/types/shipment";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FlagReviewDialogProps {
  shipmentId: string;
  document: DocumentResult | null;
  onClose: () => void;
  onFlagged: (documentId: string) => void;
}

/**
 * Raises a real review flag via `POST /shipments/{id}/documents/{id}/flag`
 * — persisted to the `document_flags` table and recorded in the audit
 * trail, not a local-only UI toggle. The reason is optional: the bar for
 * raising a flag is deliberately low (see the endpoint's docstring), so
 * requiring one would just get a placeholder typed in every time.
 */
export function FlagReviewDialog({ shipmentId, document, onClose, onFlagged }: FlagReviewDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!document) return;
    setSubmitting(true);
    const result = await flagDocument(shipmentId, document.document_id, reason.trim() || undefined);
    setSubmitting(false);

    if (!result.ok) {
      toast.error("Could not flag this document", { description: result.error.message });
      return;
    }

    toast.success(`${document.filename} flagged for review`, {
      description: "A compliance manager or admin can resolve it once reviewed.",
    });
    onFlagged(document.document_id);
    setReason("");
    onClose();
  }

  return (
    <Dialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        {document && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="size-4" aria-hidden="true" />
                Flag for review
              </DialogTitle>
              <DialogDescription>{document.filename}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="flag-reason" className="text-xs text-muted-foreground">
                Reason (optional)
              </Label>
              <Textarea
                id="flag-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Extracted GPS coordinates look implausible for this supplier's region."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Flagging…" : "Flag for review"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
