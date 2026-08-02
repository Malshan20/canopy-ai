import type { Metadata } from "next";

// A plain pass-through layout, existing for exactly one reason: the
// sibling page.tsx must be a Client Component (see its own docstring —
// that's a deliberate, load-bearing fix, not something to change), and
// Next.js doesn't allow `export const metadata` in a Client Component.
// A small Server Component layout scoped to just this route segment is
// the standard, minimal way to give a client page a real title without
// touching its logic at all.
export const metadata: Metadata = { title: "Accepting Invite" };

export default function InviteCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
