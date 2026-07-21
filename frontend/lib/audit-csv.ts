import type { AuditEvent } from "@/types/audit";

const CSV_COLUMNS = ["Timestamp", "Actor", "Action", "Details"] as const;

/**
 * Converts audit events to a CSV string. Details are serialized as JSON
 * inline (properly quoted/escaped) so the export stays a single flat file
 * — a compliance officer opening this in Excel gets one row per event
 * with the full detail payload still inspectable, not a second file to
 * cross-reference.
 */
export function auditEventsToCsv(events: AuditEvent[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = events.map((event) =>
    [
      event.timestamp,
      event.actor,
      event.action_type,
      JSON.stringify(event.details),
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [header, ...rows].join("\r\n");
}

function escapeCsvField(value: string): string {
  const needsQuoting = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/**
 * Triggers a browser download of the given CSV content — same
 * Blob + object-URL + temporary-anchor pattern used for the XML export
 * (see `hooks/use-xml-download.ts`), so both "download a file we
 * generated" flows behave identically.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
