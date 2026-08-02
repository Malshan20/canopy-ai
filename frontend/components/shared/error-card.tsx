import { AlertTriangle, RefreshCw, Wifi, Clock, ServerCrash } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ApiError, ApiErrorKind } from "@/types/api";

interface ErrorCardProps {
  error: ApiError;
  onRetry?: () => void;
  isRetrying?: boolean;
}

const ICONS_BY_KIND: Record<ApiErrorKind, LucideIcon> = {
  network: Wifi,
  cors: Wifi,
  timeout: Clock,
  validation: AlertTriangle,
  server: ServerCrash,
  unknown: AlertTriangle,
};

const GUIDANCE_BY_KIND: Record<ApiErrorKind, string> = {
  network:
    "Make sure the CanoryAI backend is running at the configured API URL and that your network connection is active.",
  cors:
    "The backend rejected this request due to CORS policy. Confirm the FastAPI CORS middleware allows this origin.",
  timeout:
    "Large archives can take longer to process. If this keeps happening, try a smaller ZIP or check the backend logs.",
  validation:
    "Double-check the archive contents and try again — see the message above for specifics.",
  server:
    "Something went wrong while the AI pipeline processed your documents. This is usually temporary.",
  unknown: "An unexpected issue occurred. Retrying usually resolves transient issues.",
};

/**
 * Attractive, actionable error surface used for failed uploads and other
 * request failures. Explains what happened and how to recover — never a
 * bare stack trace or raw error string.
 */
export function ErrorCard({ error, onRetry, isRetrying = false }: ErrorCardProps) {
  const Icon = ICONS_BY_KIND[error.kind];

  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 px-6 py-8 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger/10">
        <Icon className="size-5 text-danger" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{error.message}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {GUIDANCE_BY_KIND[error.kind]}
      </p>
      {error.detail && (
        <p className="mx-auto mt-3 max-w-md truncate text-xs text-muted-foreground/70">
          Details: {error.detail}
        </p>
      )}
      {onRetry && (
        <Button onClick={onRetry} disabled={isRetrying} className="mt-5">
          <RefreshCw className={isRetrying ? "animate-spin" : ""} />
          {isRetrying ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}
