import { db, uid, type Spine } from "./db";
import { cutStrips } from "./image";
import { bestTextMatch } from "./match";

interface ApiSpine {
  x_start: number;
  x_end: number;
  text: string;
  record_id: string;
  confidence: "high" | "medium" | "low";
}

const rankConf = { high: 3, medium: 2, low: 1 } as const;

const CODE_KEY = "waxstack-access-code";
const getCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
};

// Strips are read in parallel; make sure only one prompt shows.
let asking: Promise<void> | null = null;
function askForCode(retry: boolean) {
  asking ??= new Promise<void>((resolve, reject) => {
    const entered = window.prompt(retry ? "That code didn't work. Try again:" : "Enter the tester access code");
    if (!entered) return reject(new Error("An access code is needed to read spines."));
    try {
      localStorage.setItem(CODE_KEY, entered.trim());
    } catch {}
    resolve();
  }).finally(() => setTimeout(() => (asking = null), 0));
  return asking;
}

async function readStrip(body: object, attempt = 0): Promise<ApiSpine[]> {
  const res = await fetch("/api/read-spines", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-code": getCode() },
    body: JSON.stringify(body),
  });
  if (res.status === 401 && attempt < 2) {
    await askForCode(attempt > 0);
    return readStrip(body, attempt + 1);
  }
  if (res.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    return readStrip(body, attempt + 1);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Spine reading failed (${res.status})`);
  return data.spines as ApiSpine[];
}

const active = new Set<string>();
/** True while a scan for this section is running in this tab. */
export const isScanning = (sectionId: string) => active.has(sectionId);

/**
 * Read every spine in a section photo and link spines to collection records.
 * Spines the user has already confirmed by hand are kept as they are.
 */
export async function scanSection(sectionId: string, onProgress?: (done: number, total: number) => void) {
  const section = await db.sections.get(sectionId);
  if (!section) throw new Error("Section not found");
  if (active.has(sectionId)) return;
  active.add(sectionId);
  await db.sections.update(sectionId, { status: "scanning", scanError: undefined });

  try {
    const records = await db.records.toArray();
    const recordIds = new Set(records.map((r) => r.id));
    const collection = records.map((r) => ({ id: r.id, artist: r.artist, title: r.title, label: r.label }));
    const strips = await cutStrips(section.photo, section.width, section.height);

    let done = 0;
    onProgress?.(0, strips.length);
    // A few strips at a time keeps us friendly with rate limits.
    const results: { from: number; to: number; spines: ApiSpine[] }[] = new Array(strips.length);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, strips.length) }, async () => {
        while (cursor < strips.length) {
          const s = strips[cursor++];
          const spines = await readStrip({ image: s.base64, width: s.width, height: s.height, stripIndex: s.index, stripCount: s.count, collection });
          results[s.index] = { from: s.from, to: s.to, spines };
          onProgress?.(++done, strips.length);
        }
      }),
    );

    // Map strip-local coordinates onto the whole photo.
    let all = results.flatMap(({ from, to, spines }) =>
      spines.map((s) => ({ ...s, x0: from + s.x_start * (to - from), x1: from + s.x_end * (to - from) })),
    );
    all.sort((a, b) => a.x0 - b.x0);

    // Strips overlap, so drop duplicates: heavily overlapping neighbours.
    const merged: typeof all = [];
    for (const s of all) {
      const last = merged[merged.length - 1];
      if (last) {
        const inter = Math.min(last.x1, s.x1) - Math.max(last.x0, s.x0);
        const minW = Math.min(last.x1 - last.x0, s.x1 - s.x0);
        const sameRecord = last.record_id && last.record_id === s.record_id;
        if (sameRecord || (inter > 0 && inter / minW > 0.5)) {
          const better = rankConf[s.confidence] > rankConf[last.confidence] || (s.text.length > last.text.length && rankConf[s.confidence] === rankConf[last.confidence]);
          if (better) merged[merged.length - 1] = s;
          continue;
        }
      }
      merged.push(s);
    }
    all = merged;

    // Keep user-confirmed spines; replace everything else in this section.
    const existing = await db.spines.where("sectionId").equals(sectionId).toArray();
    const kept = existing.filter((s) => s.matchedBy === "user");
    const keptIds = new Set(kept.map((s) => s.recordId).filter(Boolean) as string[]);
    // Records already placed in other sections shouldn't be grabbed again.
    const elsewhere = await db.spines.where("sectionId").notEqual(sectionId).toArray();
    const taken = new Set<string>([...keptIds, ...(elsewhere.map((s) => s.recordId).filter(Boolean) as string[])]);

    const fresh: Spine[] = [];
    for (const s of all) {
      // Skip spines that sit where a user-confirmed spine already is.
      if (kept.some((k) => Math.min(k.x1, s.x1) - Math.max(k.x0, s.x0) > 0.5 * (s.x1 - s.x0))) continue;
      let recordId: string | undefined;
      let matchedBy: Spine["matchedBy"];
      if (s.record_id && recordIds.has(s.record_id) && !taken.has(s.record_id)) {
        recordId = s.record_id;
        matchedBy = "vision";
      } else if (s.text) {
        const m = bestTextMatch(s.text, records, taken);
        if (m) {
          recordId = m.record.id;
          matchedBy = "text";
        }
      }
      if (recordId) taken.add(recordId);
      fresh.push({ id: uid(), sectionId, x0: s.x0, x1: s.x1, text: s.text, recordId, matchedBy, confidence: s.confidence });
    }

    await db.transaction("rw", db.spines, db.sections, async () => {
      await db.spines.bulkDelete(existing.filter((s) => s.matchedBy !== "user").map((s) => s.id));
      await db.spines.bulkAdd(fresh);
      await db.sections.update(sectionId, { status: "scanned", scannedAt: Date.now() });
    });
    return { found: fresh.length + kept.length, matched: fresh.filter((s) => s.recordId).length + kept.length };
  } catch (e) {
    await db.sections.update(sectionId, { status: "error", scanError: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    active.delete(sectionId);
  }
}
