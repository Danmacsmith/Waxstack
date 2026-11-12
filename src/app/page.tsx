"use client";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import ShelfView, { type Highlight } from "@/components/ShelfView";
import { Button, Cover, Input } from "@/components/ui";
import { clearDemo, loadDemo } from "@/lib/demo";
import { db, type Section, type Spine, type VinylRecord } from "@/lib/db";
import { locate, norm, searchScore, type Location } from "@/lib/match";

type Result =
  | { type: "record"; key: string; record: VinylRecord; score: number; loc: Location }
  | { type: "spine"; key: string; spine: Spine; score: number; loc: Location };

export default function FindPage() {
  const records = useLiveQuery(() => db.records.toArray(), []);
  const sections = useLiveQuery(() => db.sections.orderBy("order").toArray(), []);
  const spines = useLiveQuery(() => db.spines.toArray(), []);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>();

  const results = useMemo<Result[]>(() => {
    if (!records || !sections || !spines || norm(query).length < 2) return [];
    const byId = new Map(records.map((r) => [r.id, r]));
    const out: Result[] = [];
    for (const r of records) {
      const score = searchScore(query, r);
      if (score > 0) out.push({ type: "record", key: r.id, record: r, score, loc: locate(r, sections, spines, byId) });
    }
    // Spines that were read but aren't linked to a collection record yet.
    const sectionById = new Map(sections.map((s) => [s.id, s]));
    const q = norm(query);
    for (const s of spines) {
      if (s.recordId || !s.text || !sectionById.has(s.sectionId)) continue;
      if (norm(s.text).includes(q)) out.push({ type: "spine", key: s.id, spine: s, score: 0.7, loc: { kind: "exact", section: sectionById.get(s.sectionId)!, spine: s } });
    }
    const locRank = (l: Location) => (l.kind === "exact" ? 0 : l.kind === "estimate" ? 1 : 2);
    return out.sort((a, b) => b.score - a.score || locRank(a.loc) - locRank(b.loc)).slice(0, 40);
  }, [query, records, sections, spines]);

  const selected = results.find((r) => r.key === selectedKey) ?? results.find((r) => r.loc.kind !== "unknown");
  const selectedSection: Section | undefined = selected && selected.loc.kind !== "unknown" ? selected.loc.section : undefined;
  const highlights: Highlight[] = selectedSection
    ? results.flatMap((r): Highlight[] => {
        if (r.loc.kind === "unknown" || r.loc.section.id !== selectedSection.id) return [];
        const primary = r.key === selected!.key;
        return r.loc.kind === "exact"
          ? [{ x0: r.loc.spine.x0, x1: r.loc.spine.x1, kind: "exact" as const, primary }]
          : [{ x0: r.loc.x0, x1: r.loc.x1, kind: "estimate" as const, primary }];
      })
    : [];

  const loading = !records || !sections || !spines;
  const isNew = !loading && records.length === 0 && sections.length === 0;

  return (
    <main className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">Waxstack</h1>
        {!loading && !isNew && (
          <span className="text-xs text-muted">
            {records.length} records · {sections.length} {sections.length === 1 ? "section" : "sections"}
          </span>
        )}
      </header>
      {!loading && sections.some((s) => s.id.startsWith("demo-")) && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-accent/10 px-3 py-2 text-sm">
          <span>
            Sample shelves loaded. Try <b>bowie</b> or <b>kraftwerk</b>.
          </span>
          <button onClick={() => clearDemo()} className="shrink-0 font-semibold text-accent">
            Remove
          </button>
        </div>
      )}

      {loading ? null : isNew ? (
        <Onboarding />
      ) : (
        <>
          <div className="sticky top-0 z-20 -mx-4 bg-bg/95 px-4 pb-3 pt-1 backdrop-blur">
            <Input
              type="search"
              autoFocus
              enterKeyHint="search"
              placeholder="Artist, title, label or cat no."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedKey(undefined);
              }}
            />
          </div>

          {selected && selectedSection && (
            <section className="mb-4">
              <ShelfView section={selectedSection} highlights={highlights} />
              <LocationLine result={selected} />
            </section>
          )}

          {norm(query).length >= 2 && results.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">Nothing matches “{query}”.</p>
          )}

          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.key}>
                <button
                  onClick={() => setSelectedKey(r.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${selected?.key === r.key ? "bg-surface-2" : ""}`}
                >
                  {r.type === "record" ? <Cover record={r.record} size={44} /> : <Cover size={44} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{r.type === "record" ? r.record.title : r.spine.text}</p>
                    <p className="truncate text-sm text-muted">{r.type === "record" ? r.record.artist : "Read from a spine, not in your collection list"}</p>
                  </div>
                  <LocChip loc={r.loc} />
                </button>
              </li>
            ))}
          </ul>

          {!query && sections?.length === 0 && (
            <div className="mt-6 rounded-2xl bg-surface p-5">
              <p className="font-semibold">Next: photograph your shelves</p>
              <p className="mt-1 text-sm text-muted">Your collection is in. Now take a photo of each cube or shelf so Waxstack can see where everything is.</p>
              <Link href="/shelves" className="mt-3 inline-block text-sm font-semibold text-accent">
                Add a shelf section →
              </Link>
            </div>
          )}
          {!query && !!sections?.length && <p className="mt-10 text-center text-sm text-muted">Type to light up a record on your shelves.</p>}
        </>
      )}
    </main>
  );
}

function LocChip({ loc }: { loc: Location }) {
  if (loc.kind === "exact") return <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">{loc.section.name}</span>;
  if (loc.kind === "estimate") return <span className="shrink-0 rounded-full border border-accent/40 px-2.5 py-1 text-xs font-medium text-accent">~ {loc.section.name}</span>;
  return <span className="shrink-0 text-xs text-muted">Not placed</span>;
}

function LocationLine({ result }: { result: Result }) {
  const loc = result.loc;
  const name = result.type === "record" ? `${result.record.artist} – ${result.record.title}` : result.spine.text;
  if (loc.kind === "exact") {
    const pct = Math.round(((loc.spine.x0 + loc.spine.x1) / 2) * 100);
    const where = pct < 25 ? "near the left" : pct > 75 ? "near the right" : pct < 45 ? "left of centre" : pct > 55 ? "right of centre" : "in the middle";
    return (
      <p className="mt-2 text-sm">
        <span className="font-semibold">{name}</span> <span className="text-muted">is in {loc.section.name}, {where}.</span>
      </p>
    );
  }
  if (loc.kind === "estimate") {
    return (
      <p className="mt-2 text-sm">
        <span className="font-semibold">{name}</span>{" "}
        <span className="text-muted">
          should be in {loc.section.name}
          {loc.after && <> after {loc.after.artist}</>}
          {loc.before && <> {loc.after ? "and" : ""} before {loc.before.artist}</>}. Estimated from your A–Z order; its spine wasn&apos;t readable.
        </span>
      </p>
    );
  }
  return null;
}

function Onboarding() {
  const steps = [
    { n: 1, title: "Bring in your collection", body: "Import from Discogs, a CSV, or skip and let Waxstack read your spines.", href: "/collection", cta: "Import collection" },
    { n: 2, title: "Photograph each section", body: "One photo per cube or shelf, straight on, spines filling the frame.", href: "/shelves", cta: "Add a shelf section" },
    { n: 3, title: "Search and it lights up", body: "Type a record and its spine glows in the photo of your shelf.", href: null, cta: null },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-muted">Find any record on your shelves in seconds. Three steps to set it up:</p>
      <Button variant="secondary" className="w-full" onClick={() => loadDemo()}>
        Try it first with sample shelves
      </Button>
      {steps.map((s) => (
        <div key={s.n} className="flex gap-4 rounded-2xl bg-surface p-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-bold text-accent-ink">{s.n}</span>
          <div>
            <p className="font-semibold">{s.title}</p>
            <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            {s.href && (
              <Link href={s.href} className="mt-2 inline-block text-sm font-semibold text-accent">
                {s.cta} →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
