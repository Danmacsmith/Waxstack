"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { usePhotoUrl } from "@/components/ShelfView";
import { Button, Empty, Input, Sheet, Spinner } from "@/components/ui";
import { db, uid, type Section, type SortRule } from "@/lib/db";
import { SORT_LABELS, StatusLine } from "@/components/sections";
import { preparePhoto } from "@/lib/image";
import { scanSection } from "@/lib/scan";



export default function ShelvesPage() {
  const sections = useLiveQuery(() => db.sections.orderBy("order").toArray(), []);
  const counts = useLiveQuery(async () => {
    const all = await db.spines.toArray();
    const m = new Map<string, { total: number; linked: number }>();
    for (const s of all) {
      const c = m.get(s.sectionId) ?? { total: 0, linked: 0 };
      c.total++;
      if (s.recordId) c.linked++;
      m.set(s.sectionId, c);
    }
    return m;
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ blob: Blob; width: number; height: number; url: string }>();
  const [name, setName] = useState("");
  const [sortRule, setSortRule] = useState<SortRule>("artist-az");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const p = await preparePhoto(f);
      setDraft({ ...p, url: URL.createObjectURL(p.blob) });
      setName(nextName(sections ?? []));
      // Most collectors keep one system throughout; default to the last one used.
      const last = sections?.[sections.length - 1];
      if (last) setSortRule(last.sortRule);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    const id = uid();
    const order = (sections?.reduce((m, s) => Math.max(m, s.order), -1) ?? -1) + 1;
    await db.sections.add({ id, name: name.trim() || nextName(sections ?? []), order, photo: draft.blob, width: draft.width, height: draft.height, sortRule, status: "new", createdAt: Date.now() });
    URL.revokeObjectURL(draft.url);
    setDraft(undefined);
    scanSection(id).catch(() => {});
    router.push(`/shelves/view?id=${id}`);
  }

  async function move(s: Section, dir: -1 | 1) {
    if (!sections) return;
    const i = sections.findIndex((x) => x.id === s.id);
    const other = sections[i + dir];
    if (!other) return;
    await db.transaction("rw", db.sections, async () => {
      await db.sections.update(s.id, { order: other.order });
      await db.sections.update(other.id, { order: s.order });
    });
  }

  return (
    <main className="px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">Shelves</h1>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : "+"} Add section
        </Button>
      </header>
      <p className="mb-4 text-sm text-muted">One photo per cube, shelf or crate. Keep them in the order you&apos;d walk along your shelves.</p>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      <details className="mb-4 rounded-2xl bg-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">Tips for a photo it can read</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>One cube or shelf per photo, filling the frame. Closer is better than wider.</li>
          <li>Stand square-on, phone level, not angled from the side.</li>
          <li>Even light, no flash. Glare off plastic sleeves hides the text.</li>
          <li>Landscape for wide shelves, portrait for tall stacks.</li>
          <li>A very full shelf? Two photos (left half, right half) read better than one.</li>
        </ul>
      </details>

      {sections && sections.length === 0 && (
        <Empty title="No shelf photos yet">
          <p>Stand square-on to one cube or shelf, get every spine in frame, and avoid glare. Good light makes a big difference.</p>
          <Button className="mt-4" onClick={() => fileRef.current?.click()}>
            Take the first photo
          </Button>
        </Empty>
      )}

      <ul className="space-y-3">
        {sections?.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-surface p-2.5">
            <Link href={`/shelves/view?id=${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Thumb section={s} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-xs text-muted">{SORT_LABELS[s.sortRule]}</p>
                <StatusLine section={s} counts={counts?.get(s.id)} />
              </div>
            </Link>
            <div className="flex flex-col">
              <button aria-label="Move up" disabled={i === 0} onClick={() => move(s, -1)} className="px-2 py-1 text-muted disabled:opacity-25">
                ▲
              </button>
              <button aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(s, 1)} className="px-2 py-1 text-muted disabled:opacity-25">
                ▼
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Sheet open={!!draft} onClose={() => setDraft(undefined)} title="New section">
        {draft && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.url} alt="" className="mb-4 max-h-56 w-full rounded-xl object-contain bg-bg" />
        )}
        {draft && <PhotoCheck width={draft.width} height={draft.height} />}
        <label className="mb-1 block text-sm font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kallax top left" />
        <label className="mb-1 mt-4 block text-sm font-medium">How is it sorted?</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(SORT_LABELS) as SortRule[]).map((k) => (
            <button key={k} onClick={() => setSortRule(k)} className={`rounded-xl border px-3 py-2.5 text-left text-sm ${sortRule === k ? "border-accent bg-accent/10 font-semibold" : "border-line"}`}>
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">With A–Z, Waxstack can estimate where a record is even when its spine can&apos;t be read.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
            Retake
          </Button>
          <Button className="flex-1" onClick={save}>
            Save and read spines
          </Button>
        </div>
      </Sheet>
    </main>
  );
}

function nextName(sections: Section[]) {
  return `Section ${sections.length + 1}`;
}

function Thumb({ section }: { section: Section }) {
  const url = usePhotoUrl(section.photo);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-16 w-16 shrink-0 rounded-xl bg-surface-2" />;
}


function PhotoCheck({ width, height }: { width: number; height: number }) {
  const warnings: string[] = [];
  if (Math.max(width, height) < 1600) warnings.push("This photo is quite small, so spine text may be hard to read. Use the camera at full resolution if you can.");
  if (width / height > 3) warnings.push("This is a very wide shot. Splitting it into two or three photos will read much better.");
  if (!warnings.length) return null;
  return (
    <div className="mb-4 space-y-1 rounded-xl bg-warn/15 p-3 text-sm">
      {warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
    </div>
  );
}
