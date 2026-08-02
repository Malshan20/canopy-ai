import { createClient } from "@/lib/supabase/server";
import { API_BASE_URL } from "@/constants/config";

/**
 * Authenticated GET-JSON fetch for use inside React Server Components
 * (`services/api.ts`'s `authenticatedFetch` relies on the *browser*
 * Supabase client and `window.location` for its 401-redirect fallback,
 * neither of which exist in a server context — this is the RSC-side
 * equivalent, kept deliberately separate rather than trying to make one
 * function work in both environments).
 *
 * Returns `null` on any failure (missing session, network error, non-2xx
 * response) rather than throwing — Server Components render synchronously
 * as part of the page tree, so a thrown error here would take down the
 * whole page render for what's often just one card's worth of data. The
 * few callers that need to distinguish "empty" from "failed to load"
 * check the specific fields they need, same as the client-side `ApiResult`
 * pattern elsewhere in this codebase.
 */
export async function serverFetchJson<T>(path: string): Promise<T | null> {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      console.error(`[CanoryAI Server API] No session available for ${path}.`);
      return null;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      // Server Components should see fresh data on every navigation —
      // this endpoint's own data can change from other users' actions.
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[CanoryAI Server API] ${path} returned ${response.status}.`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`[CanoryAI Server API] Failed to fetch ${path}:`, error);
    return null;
  }
}
