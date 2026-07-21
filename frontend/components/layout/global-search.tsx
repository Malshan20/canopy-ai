"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, FileText, Loader2 } from "lucide-react";

import { useOrgData } from "@/hooks/use-org-data";
import type { OrgDocument } from "@/hooks/use-org-data";
import { Input } from "@/components/ui/input";
import { useOnClickOutside } from "@/hooks/use-on-click-outside";

interface Match {
  document: OrgDocument;
  label: string;
  sublabel: string;
}

/**
 * The header's real quick-search — previously a purely decorative input
 * with no state or handler at all. Reuses `useOrgData` (already fetched
 * and cached by the rest of the app under the `["org-data"]` query key,
 * so this adds no extra network cost on pages that already loaded it)
 * and searches across each document's real filename, supplier/farmer
 * name, and commodity. There's no dedicated backend search endpoint yet,
 * so this is honestly scoped to what's already loaded client-side rather
 * than pretending to search the whole database — good enough for "find
 * the shipment with this supplier's name" at the scale this app
 * currently operates at, and a natural one-line swap to a real `/search`
 * endpoint later.
 */
export function GlobalSearch() {
  const router = useRouter();
  const { data } = useOrgData();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(containerRef, () => setIsOpen(false));

  const matches = useMemo<Match[]>(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2 || !data) return [];

    return data.documents
      .filter((d) => {
        const ex = d.doc.extracted_data;
        const haystack = [
          d.doc.filename,
          d.shipmentRef,
          ex?.supplier_name,
          ex?.farmer_name,
          ex?.operator_name,
          ex?.commodity ?? d.commodity,
          ex?.country ?? d.country,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 8)
      .map((d) => {
        const ex = d.doc.extracted_data;
        const who = ex?.supplier_name ?? ex?.farmer_name ?? ex?.operator_name;
        return {
          document: d,
          label: d.doc.filename,
          sublabel: [who, ex?.commodity ?? d.commodity].filter(Boolean).join(" · ") || d.shipmentRef,
        };
      });
  }, [data, query]);

  function goToMatch(match: Match) {
    router.push(`/shipments/${match.document.shipmentId}`);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search shipments, farmers, documents…"
        aria-label="Search shipments, farmers, and documents"
        className="pl-8"
      />

      {isOpen && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-auto rounded-lg border border-border bg-card py-1.5 shadow-lg">
          {!data ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Loading…
            </div>
          ) : matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No matches for &quot;{query}&quot;.</p>
          ) : (
            matches.map((match) => (
              <Link
                key={match.document.doc.document_id}
                href={`/shipments/${match.document.shipmentId}`}
                onClick={() => goToMatch(match)}
                className="flex items-start gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{match.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{match.sublabel}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
