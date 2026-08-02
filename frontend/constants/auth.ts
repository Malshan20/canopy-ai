/**
 * Every route that requires an authenticated Supabase session. `/` is
 * CanoryAI's public marketing homepage — unauthenticated by design, since
 * its entire purpose is to be readable by visitors who haven't signed up
 * yet — so it's deliberately excluded here. The actual product experience
 * now starts at `/upload` (or wherever a signed-in user lands post-login;
 * see `components/auth/login-form.tsx`). `/login` itself, and only that
 * route plus `/`, are intentionally excluded from this list.
 */
export const PROTECTED_PATH_PREFIXES = [
  "/upload",
  "/dashboard",
  "/shipments",
  "/compliance",
  "/audit-trail",
  "/settings",
  "/onboarding",
] as const;
