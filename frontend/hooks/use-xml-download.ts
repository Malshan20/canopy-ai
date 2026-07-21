"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { downloadShipmentXml, type XmlDownloadParams } from "@/services/api";
import { XML_EXPORT_FILENAME } from "@/constants/compliance-export";
import type { ApiError } from "@/types/api";

interface UseXmlDownloadResult {
  isDownloading: boolean;
  error: ApiError | null;
  download: (shipmentId: string, params: XmlDownloadParams) => Promise<boolean>;
}

/**
 * Orchestrates the "Download EUDR XML" flow: calls the backend, receives
 * the XML as a Blob, triggers a browser download via a temporary object
 * URL, and surfaces success/failure as toasts. Returns whether the
 * download succeeded so callers (e.g. the operator-details dialog) know
 * whether to close themselves.
 */
export function useXmlDownload(): UseXmlDownloadResult {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const download = useCallback(async (shipmentId: string, params: XmlDownloadParams) => {
    setIsDownloading(true);
    setError(null);

    const result = await downloadShipmentXml(shipmentId, params);

    if (!result.ok) {
      setError(result.error);
      setIsDownloading(false);
      toast.error("XML Generation Failed", {
        description: result.error.message || "Please review compliance issues and try again.",
      });
      return false;
    }

    triggerBrowserDownload(result.data, XML_EXPORT_FILENAME);

    setIsDownloading(false);
    toast.success("DDS document generated", {
      description: "Structured to match the real TRACES NT schema — review before filing.",
    });
    return true;
  }, []);

  return { isDownloading, error, download };
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
