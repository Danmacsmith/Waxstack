"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Suspense, useMemo, useRef, useState } from "react";
import ShelfView from "@/components/ShelfView";
import { SORT_LABELS, StatusLine } from "@/components/sections";
import { Button, Cover, Input, Sheet, Spinner } from "@/components/ui";
import { db, uid, type SortRule, type Spine } from "@/lib/db";
import { preparePhoto } from "@/lib/image";
import { norm, searchScore } from "@/lib/match";
import { isScanning, scanSection } from "@/lib/scan";

export default function Page() {
  return (
    <Suspense>
      <SectionPage />
    </Suspense>
  );
}

function SectionPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const section = useLiveQuery(() => db.sections.get(id), [id]);
  const spines = useLiveQuery(() => db.spines.where("sectionId").equals(id).sortBy("x0"), [id]);
  const records = useLiveQuery(() => db.records.toArray(), []);
  const [selected, setSelected] = useState<Spine>();
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const byId = useMemo(() => new Map((records ?? []).map((r) => [r.id, r])), [records]);

  if (section === undefined) return <main className="grid min-h-dvh place-items-center"><Spinner /></main>;
  if (section === null || !section) return <main className="p-6">Section not found. <Link href="/shelves" className="text-accent">Back</Link></main>;

  const running = isScanning(section.id) || !!progress;
  const total = spines?.length ?? 0;
  const linked = spines?.filter((s) => s.recordId).length ?? 0;
  const live = spines?.find((s) => s.id === selected?.id);

  async function rescan() {
    setError(undefined);
    setProgress({ done: 0, total: 1 });
    try {
      await scanSection(id, (done, total) => setProgress({ done, total }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(undefined);
    }
  }

  async function replacePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const p = await preparePhoto(f);
    // A new photo means old positions no longer line up, including confirmed ones.
    await db.transaction("rw", db.sections, db.spines, async () => {
      await db.spines.where("sectionId").equals(id).delete();
      await db.sections.update(id, { photo: p.blob, width: p.width, height: p.height, status: "new" });
    });
    setSettingsOpen(false);
    rescan();
  }

  return (
    <main className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/shelves" className="text-sm font-semibold text-accent">
          ← Shelves
        </Link>
        <button onClick={() => setSettingsOpen(true)} className="text-sm font-semibold text-muted">
          Edit section
        </button>
      </div>
      <h1 className="font-display text-2xl font-bold">{section.name}</h1>
      <p className="mb-3 text-sm text-muted">{SORT_LABELS[section.sortRule]}</p>

      <ShelfView
        section={section}
        spines={spines}
        selectedSpineId={selected?.id}
        onSpineTap={(s) => {
          setAdding(false);
          setSelected(s);
        }}
        onPhotoTap={
          adding
            ? async (x) => {
                const half = 0.008;
                const spine: Spine = { id: uid(), sectionId: id, x0: Math.max(0, x - half), x1: Math.min(1, x + half), text: "", confidence: "low" };
                await db.spines.add(spine);
                setAdding(false);
                setSelected(spine);
              }
            : undefined
        }
      />
      {adding && <p className="mt-2 rounded-xl bg-accent/10 p-3 text-sm text-accent">Tap the photo where the missed record is.</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        {running ? (
          <p className="flex items-center gap-2 text-sm text-accent">
            <Spinner /> Reading spines{progress && progress.total > 1 ? ` · strip ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : "…"}
          </p>
        ) : (
          <div>
            <StatusLine section={section} counts={{ total, linked }} />
            {total > 0 && <p className="text-xs text-muted">Tap a spine to check or fix it.</p>}
          </div>
        )}
        <Button variant="secondary" onClick={rescan} disabled={running}>
          {section.status === "scanned" ? "Read again" : "Read spines"}
        </Button>
      </div>
      <button onClick={() => setAdding((a) => !a)} className="mt-2 text-sm font-semibold text-accent">
        {adding ? "Cancel" : "+ Add a spine it missed"}
      </button>
      {error && <p className="mt-2 rounded-xl bg-accent/10 p-3 text-sm text-accent">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <Legend colour="#ffffff" label="Matched" />
        <Legend colour="var(--ok)" label="Confirmed by you" />
        <Legend colour="var(--warn)" label="Not matched" />
      </div>

      {total > 0 && (
        <ol className="mt-5 space-y-1">
          {spines!.map((s, i) => {
            const r = s.recordId ? byId.get(s.recordId) : undefined;
            return (
              <li key={s.id}>
                <button onClick={() => setSelected(s)} className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ${selected?.id === s.id ? "bg-surface-2" : ""}`}>
                  <span className="w-6 text-right text-xs tabular-nums text-muted">{i + 1}</span>
                  <Cover record={r} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r ? `${r.artist} – ${r.title}` : s.text || "Unreadable spine"}</p>
                    {r && s.text && <p className="truncate text-xs text-muted">Read: “{s.text}”</p>}
                  </div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${r ? (s.matchedBy === "user" ? "bg-ok" : "bg-ink/60") : "bg-warn"}`} />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <SpineSheet spine={live} onClose={() => setSelected(undefined)} records={records ?? []} />

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Edit section">
        <SectionSettings
          name={section.name}
          sortRule={section.sortRule}
          onSave={async (name, sortRule) => {
            await db.sections.update(id, { name: name.trim() || section.name, sortRule });
            setSettingsOpen(false);
          }}
        />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={replacePhoto} />
        <div className="mt-6 space-y-2 border-t border-line pt-4">
          <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
            Replace photo
          </Button>
          <Button
            variant="danger"
            className="w-full"
            onClick={async () => {
              if (!confirm(`Delete “${section.name}”? Its photo and spine positions will be removed. Records stay in your collection.`)) return;
              await db.transaction("rw", db.sections, db.spines, async () => {
                await db.spines.where("sectionId").equals(id).delete();
                await db.sections.delete(id);
              });
              router.replace("/shelves");
            }}
          >
            Delete section
          </Button>
        </div>
      </Sheet>
    </main>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3 w-1.5 rounded-sm border" style={{ borderColor: colour, background: `color-mix(in srgb, ${colour} 25%, transparent)` }} />
      {label}
    </span>
  );
}

function SectionSettings({ name: initialName, sortRule: initialSort, onSave }: { name: string; sortRule: SortRule; onSave: (n: string, s: SortRule) => void }) {
  const [name, setName] = useState(initialName);
  const [sortRule, setSortRule] = useState(initialSort);
  return (
    <>
      <label className="mb-1 block text-sm font-medium">Name</label>
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <label className="mb-1 mt-4 block text-sm font-medium">Sorted</label>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(SORT_LABELS) as SortRule[]).map((k) => (
          <button key={k} onClick={() => setSortRule(k)} className={`rounded-xl border px-3 py-2.5 text-left text-sm ${sortRule === k ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
            {SORT_LABELS[k]}
          </button>
        ))}
      </div>
      <Button className="mt-4 w-full" onClick={() => onSave(name, sortRule)}>
        Save
      </Button>
    </>
  );
}

/** Check, fix or add a single spine. */
function SpineSheet({ spine, onClose, records }: { spine?: Spine; onClose: () => void; records: { id: string; artist: string; title: string; coverUrl?: string }[] }) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"view" | "pick" | "new">("view");
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const current = spine?.recordId ? records.find((r) => r.id === spine.recordId) : undefined;

  const close = () => {
    setMode("view");
    setQ("");
    onClose();
  };
  const results = useMemo(() => {
    if (norm(q).length < 2) return [];
    return records
      .map((r) => ({ r, s: searchScore(q, { ...r, source: "manual", createdAt: 0 }) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.r);
  }, [q, records]);

  if (!spine) return null;

  async function link(recordId: string) {
    // A record can only be in one place: unlink it anywhere else first.
    await db.transaction("rw", db.spines, async () => {
      await db.spines.where("recordId").equals(recordId).modify({ recordId: undefined, matchedBy: undefined });
      await db.spines.update(spine!.id, { recordId, matchedBy: "user" });
    });
    close();
  }

  return (
    <Sheet open onClose={close} title={current ? "Matched spine" : "Unmatched spine"}>
      <p className="mb-3 text-sm text-muted">
        Read from photo: <span className="text-ink">{spine.text ? `“${spine.text}”` : "nothing legible"}</span>
      </p>

      {mode === "view" && (
        <>
          {current && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-bg p-3">
              <Cover record={current} size={48} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{current.title}</p>
                <p className="truncate text-sm text-muted">{current.artist}</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {current && spine.matchedBy !== "user" && (
              <Button className="w-full" onClick={() => link(current.id)}>
                Yes, that&apos;s right
              </Button>
            )}
            <Button variant={current ? "secondary" : "primary"} className="w-full" onClick={() => setMode("pick")}>
              {current ? "It's a different record" : "Choose from my collection"}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const [a, ...rest] = spine.text.split(/\s{2,}| - | – /);
                setArtist(rest.length ? a : "");
                setTitle(rest.length ? rest.join(" ") : spine.text);
                setMode("new");
              }}
            >
              Add as a new record
            </Button>
            {current && (
              <Button variant="ghost" className="w-full" onClick={async () => { await db.spines.update(spine.id, { recordId: undefined, matchedBy: undefined }); close(); }}>
                Unlink
              </Button>
            )}
            <Button variant="ghost" className="w-full text-muted" onClick={async () => { await db.spines.delete(spine.id); close(); }}>
              Not a record, remove it
            </Button>
          </div>
        </>
      )}

      {mode === "pick" && (
        <>
          <Input autoFocus type="search" placeholder="Search your collection" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-2 space-y-1">
            {results.map((r) => (
              <li key={r.id}>
                <button onClick={() => link(r.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                  <Cover record={r} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.title}</p>
                    <p className="truncate text-xs text-muted">{r.artist}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {records.length === 0 && <p className="mt-3 text-sm text-muted">Your collection is empty. Add this one as a new record instead.</p>}
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setMode("view")}>
            Back
          </Button>
        </>
      )}

      {mode === "new" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!artist.trim() && !title.trim()) return;
            const id = uid();
            await db.transaction("rw", db.records, db.spines, async () => {
              await db.records.add({ id, artist: artist.trim(), title: title.trim(), source: "spine", createdAt: Date.now() });
              await db.spines.update(spine.id, { recordId: id, matchedBy: "user" });
            });
            close();
          }}
        >
          <label className="mb-1 block text-sm font-medium">Artist</label>
          <Input autoFocus value={artist} onChange={(e) => setArtist(e.target.value)} />
          <label className="mb-1 mt-3 block text-sm font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" className="mt-4 w-full">
            Add and link
          </Button>
          <Button type="button" variant="ghost" className="mt-1 w-full" onClick={() => setMode("view")}>
            Back
          </Button>
        </form>
      )}
    </Sheet>
  );
}
