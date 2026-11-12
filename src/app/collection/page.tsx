"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useRef, useState } from "react";
import { Button, Cover, Input, Sheet, Spinner } from "@/components/ui";
import { db, uid, type VinylRecord } from "@/lib/db";
import { recordsFromCsv } from "@/lib/csv";
import { norm, searchScore, sortKey, surnameSortKey } from "@/lib/match";
import { exportBackup, importBackup } from "@/lib/backup";

type Incoming = Omit<VinylRecord, "id" | "createdAt" | "source">;

/** Add records, skipping ones already in the collection. */
async function addRecords(items: Incoming[], source: VinylRecord["source"]) {
  const existing = await db.records.toArray();
  const seenIds = new Set(existing.map((r) => r.discogsId).filter(Boolean));
  const seenKeys = new Set(existing.map((r) => sortKey(r)));
  const fresh: VinylRecord[] = [];
  for (const it of items) {
    if (it.discogsId && seenIds.has(it.discogsId)) continue;
    const k = sortKey(it);
    if (!it.discogsId && seenKeys.has(k)) continue;
    if (it.discogsId) seenIds.add(it.discogsId);
    seenKeys.add(k);
    fresh.push({ ...it, id: uid(), source, createdAt: Date.now() });
  }
  await db.records.bulkAdd(fresh);
  return { added: fresh.length, skipped: items.length - fresh.length };
}

export default function CollectionPage() {
  const records = useLiveQuery(() => db.records.toArray(), []);
  const placed = useLiveQuery(async () => new Set((await db.spines.toArray()).map((s) => s.recordId).filter(Boolean) as string[]), []);
  const [filter, setFilter] = useState("");
  const [sheet, setSheet] = useState<"discogs" | "manual" | "more" | null>(null);
  const [status, setStatus] = useState<string>();
  const csvRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    if (!records) return [];
    const q = norm(filter);
    const base = q.length >= 2 ? records.filter((r) => searchScore(filter, r) > 0) : records;
    return [...base].sort((a, b) => surnameSortKey(a).localeCompare(surnameSortKey(b)));
  }, [records, filter]);

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const items = recordsFromCsv(await f.text());
      const { added, skipped } = await addRecords(items, "csv");
      setStatus(`Added ${added} records${skipped ? `, skipped ${skipped} already here` : ""}.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  const placedCount = records?.filter((r) => placed?.has(r.id)).length ?? 0;

  return (
    <main className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">Collection</h1>
        <button onClick={() => setSheet("more")} className="text-sm font-semibold text-muted">
          Backup
        </button>
      </header>
      {records && records.length > 0 && (
        <p className="mb-4 text-sm text-muted">
          {records.length} records · {placedCount} located on your shelves
        </p>
      )}

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Button variant="secondary" className="flex-col !gap-0.5 py-3 text-xs" onClick={() => setSheet("discogs")}>
          <span className="text-base">◎</span> Discogs
        </Button>
        <Button variant="secondary" className="flex-col !gap-0.5 py-3 text-xs" onClick={() => csvRef.current?.click()}>
          <span className="text-base">▤</span> CSV file
        </Button>
        <Button variant="secondary" className="flex-col !gap-0.5 py-3 text-xs" onClick={() => setSheet("manual")}>
          <span className="text-base">＋</span> Add one
        </Button>
      </div>
      <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsv} />
      {status && <p className="mb-4 rounded-xl bg-surface p-3 text-sm">{status}</p>}

      {records && records.length === 0 && (
        <div className="rounded-2xl bg-surface p-5 text-sm text-muted">
          <p className="font-semibold text-ink">Why import first?</p>
          <p className="mt-1">
            Spine text is tiny and often half-legible. When Waxstack already knows what you own, it only has to pick the right record from your list, which is far more reliable than identifying an unknown one.
          </p>
          <p className="mt-2">No Discogs? Skip this. Photograph your shelves and add records from what the spines say.</p>
        </div>
      )}

      {records && records.length > 0 && (
        <>
          <Input type="search" placeholder="Filter collection" value={filter} onChange={(e) => setFilter(e.target.value)} className="mb-3" />
          <ul className="space-y-1">
            {list.slice(0, 500).map((r) => (
              <RecordRow key={r.id} record={r} placed={!!placed?.has(r.id)} />
            ))}
          </ul>
          {list.length > 500 && <p className="py-4 text-center text-xs text-muted">Showing 500 of {list.length}. Filter to narrow down.</p>}
        </>
      )}

      <Sheet open={sheet === "discogs"} onClose={() => setSheet(null)} title="Import from Discogs">
        <DiscogsImport
          onDone={(msg) => {
            setStatus(msg);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "manual"} onClose={() => setSheet(null)} title="Add a record">
        <ManualAdd
          onDone={(msg) => {
            setStatus(msg);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === "more"} onClose={() => setSheet(null)} title="Backup">
        <p className="mb-4 text-sm text-muted">
          Everything is stored on this device only. Download a backup to keep it safe or move it to another phone.
        </p>
        <div className="space-y-2">
          <Button className="w-full" onClick={() => exportBackup()}>
            Download backup
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => backupRef.current?.click()}>
            Restore from backup
          </Button>
          <input
            ref={backupRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!confirm("Restoring replaces everything currently in Waxstack on this device. Continue?")) return;
              try {
                await importBackup(f);
                setStatus("Backup restored.");
              } catch (err) {
                setStatus(err instanceof Error ? err.message : "Couldn't restore that file.");
              }
              setSheet(null);
            }}
          />
        </div>
      </Sheet>
    </main>
  );
}

function RecordRow({ record, placed }: { record: VinylRecord; placed: boolean }) {
  return (
    <li className="flex items-center gap-3 px-1 py-1.5">
      <Cover record={record} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{record.title}</p>
        <p className="truncate text-xs text-muted">
          {record.artist}
          {record.year ? ` · ${record.year}` : ""}
          {record.label ? ` · ${record.label}` : ""}
        </p>
      </div>
      <span title={placed ? "Located on a shelf" : "Not located yet"} className={`h-2 w-2 shrink-0 rounded-full ${placed ? "bg-accent" : "bg-line"}`} />
      <button
        aria-label={`Delete ${record.title}`}
        className="px-1 text-muted"
        onClick={async () => {
          if (!confirm(`Remove “${record.artist} – ${record.title}” from your collection?`)) return;
          await db.transaction("rw", db.records, db.spines, async () => {
            await db.spines.where("recordId").equals(record.id).modify({ recordId: undefined, matchedBy: undefined });
            await db.records.delete(record.id);
          });
        }}
      >
        ×
      </button>
    </li>
  );
}

function DiscogsImport({ onDone }: { onDone: (msg: string) => void }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string>();

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const all: Incoming[] = [];
      let page = 1;
      let pages = 1;
      do {
        setProgress(`Fetching page ${page}${pages > 1 ? ` of ${pages}` : ""}…`);
        const res = await fetch(`/api/discogs?username=${encodeURIComponent(username.trim())}&page=${page}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Discogs import failed.");
        all.push(...data.records);
        pages = data.pages;
        page++;
        // Discogs allows ~25 unauthenticated requests a minute.
        if (page <= pages) await new Promise((r) => setTimeout(r, 1200));
      } while (page <= pages);
      const { added, skipped } = await addRecords(all, "discogs");
      onDone(`Imported ${added} records from Discogs${skipped ? ` (${skipped} already here)` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <form onSubmit={run}>
      <p className="mb-3 text-sm text-muted">Your Discogs collection needs to be public. You can also export it as a CSV from Discogs and use the CSV option.</p>
      <label className="mb-1 block text-sm font-medium">Discogs username</label>
      <Input autoFocus autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} />
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      <Button type="submit" className="mt-4 w-full" disabled={busy || !username.trim()}>
        {busy ? (
          <>
            <Spinner /> {progress}
          </>
        ) : (
          "Import collection"
        )}
      </Button>
    </form>
  );
}

function ManualAdd({ onDone }: { onDone: (msg: string) => void }) {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!artist.trim() && !title.trim()) return;
        const { added } = await addRecords([{ artist: artist.trim(), title: title.trim(), label: label.trim() || undefined }], "manual");
        onDone(added ? `Added ${artist} – ${title}.` : "That record is already in your collection.");
      }}
    >
      <label className="mb-1 block text-sm font-medium">Artist</label>
      <Input autoFocus value={artist} onChange={(e) => setArtist(e.target.value)} />
      <label className="mb-1 mt-3 block text-sm font-medium">Title</label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="mb-1 mt-3 block text-sm font-medium">Label (optional)</label>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      <Button type="submit" className="mt-4 w-full">
        Add record
      </Button>
    </form>
  );
}
