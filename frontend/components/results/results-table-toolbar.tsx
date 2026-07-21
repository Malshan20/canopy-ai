"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

interface ResultsTableToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
}

export function ResultsTableToolbar({
  query,
  onQueryChange,
  resultCount,
  totalCount,
}: ResultsTableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search filename, farmer, receipt…"
          aria-label="Search documents"
          className="pl-8"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {resultCount} of {totalCount} document{totalCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}
