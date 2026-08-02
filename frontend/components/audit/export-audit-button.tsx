"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { auditEventsToCsv, downloadCsv } from "@/lib/audit-csv";
import { AUDIT_CSV_FILENAME } from "@/constants/audit";
import type { AuditEvent } from "@/types/audit";

interface ExportAuditButtonProps {
  events: AuditEvent[];
  disabled?: boolean;
}

/**
 * "Download 5-Year Audit Report" — converts the already-fetched audit
 * events to CSV client-side and triggers a browser download. No extra
 * network round trip: the data is already on the page.
 */
export function ExportAuditButton({ events, disabled = false }: ExportAuditButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  function handleExport() {
    setIsExporting(true);
    try {
      const csv = auditEventsToCsv(events);
      downloadCsv(csv, AUDIT_CSV_FILENAME);
      toast.success("Audit report downloaded", {
        description: `${events.length} event(s) exported to ${AUDIT_CSV_FILENAME}.`,
      });
    } catch (error) {
      console.error("[CanoryAI] Audit CSV export failed:", error);
      toast.error("Export failed", {
        description: "Could not generate the audit report. Please try again.",
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={disabled || isExporting}>
      {isExporting ? <Loader2 className="animate-spin" /> : <Download />}
      Download 5-Year Audit Report
    </Button>
  );
}
