import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components ("use client"). Reads the
 * session from cookies automatically via @supabase/ssr — never store or
 * pass tokens manually when this client is available.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
