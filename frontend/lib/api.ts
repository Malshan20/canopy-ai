/**
 * Re-exports CanoryAI's single authenticated API client.
 *
 * The actual implementation lives in `services/api.ts` — that file
 * already was, and remains, "the single source of truth for all frontend
 * API communication" (JWT attachment, session refresh, timeout/network/
 * unauthorized/unexpected-response handling — see its own docstrings).
 * This file exists so `lib/api.ts` is a valid, working import path
 * without creating a second, competing fetch wrapper: duplicating that
 * logic across two files would be the exact "avoid duplicating fetch
 * logic throughout the application" mistake this file is meant to
 * prevent, not create.
 */
export * from "@/services/api";
