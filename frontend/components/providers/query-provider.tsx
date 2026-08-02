"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query provider — powers the real-time-ish data synchronization
 * used by the Shipments list, Dashboard, and Compliance pages (interval
 * polling against real, already-existing REST endpoints while the tab has
 * focus). See `hooks/use-shipments-list.ts` for where the actual polling
 * interval and focus-aware refetching are configured.
 *
 * `useState(() => new QueryClient())` (rather than a module-level
 * singleton) is the documented-correct pattern for App Router: it keeps
 * the client instance stable across re-renders of this component while
 * still creating a fresh one per request on the server, avoiding shared
 * state leaking between different users' requests.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
