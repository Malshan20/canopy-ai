"use client";

import { useEffect } from "react";

/**
 * The one error boundary app/error.tsx can't cover: a failure in the
 * root layout itself (app/layout.tsx), not in a page underneath it.
 * Next.js requires this to be a completely separate file that renders
 * its own <html>/<body> — it replaces the root layout entirely when
 * that layout is what failed, so it can't assume the layout's CSS or
 * any of its providers survived. Inline styles only, deliberately, for
 * exactly that reason: this is the one place in the app where relying
 * on the normal styling pipeline being intact would be circular.
 *
 * Genuinely rare in practice — most errors happen in page content, not
 * the shared layout — but without this file, that rare case would still
 * be a completely blank white screen with literally no way to recover.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[CanoryAI] Unhandled error in the root layout:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#F7F5F0" }}>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(220, 38, 38, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
            aria-hidden="true"
          >
            ⚠️
          </div>
          <h1 style={{ marginTop: 20, fontSize: 20, fontWeight: 600, color: "#1A1A1A" }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 8, maxWidth: 380, fontSize: 14, lineHeight: 1.6, color: "#6B7280" }}>
            CanoryAI hit an unexpected error loading this page. It&apos;s been logged — try reloading.
          </p>
          {error.digest && (
            <p style={{ marginTop: 12, fontFamily: "monospace", fontSize: 12, color: "#9CA3AF" }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              marginTop: 28,
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#1B4332",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
