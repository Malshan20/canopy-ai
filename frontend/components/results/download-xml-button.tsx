"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DownloadXmlDialog } from "@/components/results/download-xml-dialog";

interface DownloadXmlButtonProps {
  shipmentId: string;
  /** Disabled (with an explanatory tooltip) when the shipment hasn't cleared compliance. */
  disabled?: boolean;
}

/**
 * Primary "Download EUDR XML" action for the shipment results dashboard.
 * Opens a small dialog to collect operator/commodity details, then
 * triggers the actual generation + download (see `DownloadXmlDialog` /
 * `useXmlDownload`).
 */
export function DownloadXmlButton({ shipmentId, disabled = false }: DownloadXmlButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper keeps the tooltip working even while the button is disabled */}
          <span>
            <Button onClick={() => setDialogOpen(true)} disabled={disabled}>
              <Download />
              Download EUDR XML
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {disabled
            ? "This shipment must pass mass balance and satellite verification before a DDS can be generated."
            : "Generate a DDS document structured to match the real TRACES NT schema"}
        </TooltipContent>
      </Tooltip>

      <DownloadXmlDialog shipmentId={shipmentId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
