"use client";

import { MoreHorizontal, Eye, ClipboardCheck, ClipboardX, Download, Satellite } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentResult } from "@/types/shipment";
import { resolveDocumentFlag } from "@/services/api";

interface RowActionsProps {
  document: DocumentResult;
  isFlagged: boolean;
  onView: (document: DocumentResult) => void;
  onFlagRequested: (document: DocumentResult) => void;
  onVerifySatellite: (document: DocumentResult) => void;
  /** Called after a flag is successfully resolved, so the parent can refresh its flagged-set. */
  onFlagResolved: (documentId: string) => void;
  shipmentId: string;
}

function downloadJson(document: DocumentResult) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.document_id}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function RowActions({
  document,
  isFlagged,
  onView,
  onFlagRequested,
  onVerifySatellite,
  onFlagResolved,
  shipmentId,
}: RowActionsProps) {
  async function resolveFlag() {
    const result = await resolveDocumentFlag(shipmentId, document.document_id);
    if (!result.ok) {
      toast.error("Could not resolve this flag", { description: result.error.message });
      return;
    }
    toast.success(`${document.filename} flag resolved`);
    onFlagResolved(document.document_id);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${document.filename}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onView(document)}>
          <Eye />
          View details
        </DropdownMenuItem>
        {isFlagged ? (
          <DropdownMenuItem onSelect={resolveFlag}>
            <ClipboardX />
            Resolve flag
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onFlagRequested(document)}>
            <ClipboardCheck />
            Flag for review
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => downloadJson(document)}>
          <Download />
          Download JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onVerifySatellite(document)}>
          <Satellite />
          Verify against satellite imagery
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
