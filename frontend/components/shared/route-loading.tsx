/**
 * The shared loading state every route's `loading.tsx` renders. Next.js
 * automatically wraps each route segment in a Suspense boundary keyed to
 * its `loading.tsx` file, so this fills the real gap between "user
 * clicked a nav link" and "the destination page's own content (or its
 * own skeleton) is ready" — previously a blank flash.
 *
 * Deliberately a Server Component with zero client JS: the animation is
 * pure CSS (Tailwind's built-in `animate-*` utilities plus one small
 * custom keyframe in globals.css), not a JS-driven library — a loading
 * indicator that itself ships extra JavaScript to load would be a little
 * self-defeating for a page about optimizing perceived performance.
 */
export function RouteLoading() {
  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-5" role="status" aria-label="Loading">
      <div className="relative flex size-16 items-center justify-center">
        {/* Soft outer glow, breathing slowly */}
        <div className="absolute inset-0 animate-pulse rounded-2xl bg-forest-500/15 blur-xl" />
        {/* Rotating ring */}
        <div className="absolute inset-0 animate-spin rounded-2xl [animation-duration:2.2s]">
          <div className="size-full rounded-2xl border-2 border-transparent border-t-forest-500/70 border-r-forest-500/25" />
        </div>
        {/* Static brand mark, center */}
        <div className="relative flex size-11 items-center justify-center rounded-xl bg-forest-500/15">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 text-forest-500"
            aria-hidden="true"
          >
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        </div>
      </div>
      <p className="text-sm font-medium text-muted-foreground">Loading…</p>
    </div>
  );
}
