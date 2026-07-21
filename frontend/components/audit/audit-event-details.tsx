interface AuditEventDetailsProps {
  details: Record<string, unknown>;
}

/**
 * Renders an audit event's `details` JSON as a readable key-value grid
 * rather than a raw JSON dump — field changes, confidence scores,
 * coordinates, and AI decisions should all be scannable at a glance.
 * Falls back to pretty-printed JSON for nested objects/arrays, since those
 * don't flatten sensibly into a single value cell.
 */
export function AuditEventDetails({ details }: AuditEventDetailsProps) {
  const entries = Object.entries(details);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No additional details recorded.</p>;
  }

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {humanizeKey(key)}
          </dt>
          <dd className="mt-0.5 break-words font-mono text-sm text-foreground">
            {formatValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : JSON.stringify(value);
  }
  return JSON.stringify(value, null, 2);
}
