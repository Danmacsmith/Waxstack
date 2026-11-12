"use client";
import { Spinner } from "@/components/ui";
import type { Section, SortRule } from "@/lib/db";
import { isScanning } from "@/lib/scan";

export const SORT_LABELS: Record<SortRule, string> = {
  "artist-az": "A–Z by artist",
  genre: "By genre",
  label: "By label",
  none: "No particular order",
};

export function StatusLine({ section, counts }: { section: Section; counts?: { total: number; linked: number } }) {
  if ((section.status === "scanning" || section.status === "new") && isScanning(section.id))
    return (
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-accent">
        <Spinner className="h-3 w-3" /> Reading spines…
      </p>
    );
  if (section.status === "scanning" || section.status === "new") return <p className="mt-0.5 text-xs text-warn">Reading was interrupted. Open to retry.</p>;
  if (section.status === "error") return <p className="mt-0.5 text-xs text-accent">Couldn&apos;t read: {section.scanError}</p>;
  return (
    <p className="mt-0.5 text-xs text-muted">
      {counts?.total ?? 0} spines · {counts?.linked ?? 0} matched
    </p>
  );
}
