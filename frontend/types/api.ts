/**
 * Normalized API result types. Every service function returns one of these
 * shapes instead of throwing, so UI code can handle failure paths (network,
 * CORS, timeout, validation, server error) uniformly without try/catch
 * scattered across components.
 */

export type ApiErrorKind =
  | "network"
  | "cors"
  | "timeout"
  | "validation"
  | "server"
  | "unknown";

export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  detail?: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };
