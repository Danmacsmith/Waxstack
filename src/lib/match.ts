import type { Section, Spine, VinylRecord } from "./db";

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function norm(s: string | undefined | null): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["the", "a", "an", "and", "of", "lp", "records", "recordings", "vol", "volume"]);
const tokens = (s: string) => norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));

/** Similarity of two tokens, tolerant of OCR slips ("B0WIE" vs "bowie"). */
function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const sim = 1 - d / maxLen;
  return sim >= 0.7 ? sim : 0;
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return Math.max(a.length, b.length);
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** How much of `needle`'s tokens appear (fuzzily) in `hay`. 0–1. */
function coverage(needle: string[], hay: string[]): number {
  if (!needle.length || !hay.length) return 0;
  let total = 0;
  for (const n of needle) {
    let best = 0;
    for (const h of hay) best = Math.max(best, tokenSim(n, h));
    total += best;
  }
  return total / needle.length;
}

/** Score how well spine text matches a record. 0–1. */
export function spineScore(spineText: string, r: VinylRecord): number {
  const spine = tokens(spineText);
  if (!spine.length) return 0;
  const artist = tokens(r.artist);
  const title = tokens(r.title);
  const a = coverage(artist, spine);
  const t = coverage(title, spine);
  const cat = r.catno && norm(spineText).replace(/ /g, "").includes(norm(r.catno).replace(/ /g, "")) ? 1 : 0;
  if (cat && norm(r.catno).length >= 4) return Math.max(0.9, (a + t) / 2);
  // Both artist and title should show up; a title alone is weaker (self-titled albums excepted).
  if (!artist.length) return t * 0.8;
  return a * 0.45 + t * 0.55 - (a < 0.5 || t < 0.5 ? 0.25 : 0);
}

export function bestTextMatch(spineText: string, records: VinylRecord[], taken: Set<string>) {
  let best: { record: VinylRecord; score: number } | null = null;
  for (const r of records) {
    if (taken.has(r.id)) continue;
    const s = spineScore(spineText, r);
    if (s > (best?.score ?? 0)) best = { record: r, score: s };
  }
  return best && best.score >= 0.62 ? best : null;
}

/** Search-box scoring. 0 means no match. */
export function searchScore(query: string, r: VinylRecord): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const hay = tokens(`${r.artist} ${r.title} ${r.label ?? ""} ${r.catno ?? ""} ${r.genre ?? ""}`);
  const c = coverage(q, hay);
  if (c < 0.75) return 0;
  const exactArtist = norm(r.artist) === norm(query) ? 0.3 : 0;
  const exactTitle = norm(r.title) === norm(query) ? 0.3 : 0;
  return c + exactArtist + exactTitle;
}

/** Key used to place records in A–Z order: artist (without "The"), then title. */
export function sortKey(r: Pick<VinylRecord, "artist" | "title">): string {
  return `${norm(r.artist).replace(/^the /, "")}  ${norm(r.title)}`;
}

// Common first names, used to guess which artists are people. Collectors
// usually file "David Bowie" under B but "Pink Floyd" under P.
const FIRST_NAMES = new Set(
  "aaron adam adele al alan alanis albert alex alice alicia amy andrew andy ann anna anne annie antonio aretha art arthur barbara barry ben benny bert beth bill billie billy bob bobby bonnie brian bruce buddy burt carl carla carly carole caroline cat charles charlie chet chris christina christine chuck cliff curtis dan daniel danny dave david dean debbie dennis diana dinah dionne dolly don donna donny duke dusty eddie edwin elton elvis emmylou eric etta frank frankie fred gary george gil gladys glen gordon grace graham greg gregory gwen hank harry herbie ian iggy isaac jack jackie jackson james jamie jane janet janis jason jeff jennifer jerry jill jim jimi jimmy joan joe john johnny joni jose julian june kanye karen kate kelly ken kenny kevin kim kirsty kurt lana laura lauryn lee lenny leon leonard linda lionel lisa lou louis lucinda luther marc marcus maria mariah marianne mark martha marty marvin mary matt max michael mick mike miles nancy natalie neil nick nina norah otis patsy patti paul peggy pete peter phil quincy randy ray richard rick rickie ricky rita rob robbie robert rod roger ron ronnie roy ruby rufus ryan sam sarah scott sean serge shania sharon sheryl solomon stan steve stevie sufjan suzanne ted terry thelonious tim todd tom tommy tony tracy van vince warren whitney willie wilson yoko zac".split(" "),
);
const NOT_A_PERSON = /\b(and|band|orchestra|trio|quartet|quintet|experience|group|ensemble|brothers|sisters|singers|family)\b/;

function surnameFirst(artist: string): string {
  const a = norm(artist).replace(/^the /, "");
  const words = a.split(" ");
  if (words.length < 2 || words.length > 3 || NOT_A_PERSON.test(a) || !FIRST_NAMES.has(words[0])) return a;
  return `${words[words.length - 1]} ${words.slice(0, -1).join(" ")}`;
}

/** Same as sortKey, but solo artists by surname. */
export function surnameSortKey(r: Pick<VinylRecord, "artist" | "title">): string {
  return `${surnameFirst(r.artist)}  ${norm(r.title)}`;
}

/** Count neighbouring pairs that are out of order: lower = convention fits the shelves better. */
function disorder(keys: string[]): number {
  let n = 0;
  for (let i = 1; i < keys.length; i++) if (keys[i] < keys[i - 1]) n++;
  return n;
}

export type Location =
  | { kind: "exact"; section: Section; spine: Spine }
  | { kind: "estimate"; section: Section; x0: number; x1: number; after?: VinylRecord; before?: VinylRecord }
  | { kind: "unknown" };

/**
 * Where is this record? Exact if a spine is linked to it; otherwise, if the
 * shelves are sorted A–Z, estimate from the nearest located neighbours.
 */
export function locate(
  record: VinylRecord,
  sections: Section[],
  spines: Spine[],
  recordsById: Map<string, VinylRecord>,
): Location {
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const own = spines.find((s) => s.recordId === record.id);
  if (own) {
    const section = sectionById.get(own.sectionId);
    if (section) return { kind: "exact", section, spine: own };
  }

  // Only estimate across sections that are kept A–Z.
  const sorted = sections.filter((s) => s.sortRule === "artist-az").sort((a, b) => a.order - b.order);
  if (!sorted.length) return { kind: "unknown" };
  const rank = new Map(sorted.map((s, i) => [s.id, i]));

  const placed = spines
    .filter((s) => s.recordId && rank.has(s.sectionId) && recordsById.has(s.recordId))
    .sort((a, b) => rank.get(a.sectionId)! - rank.get(b.sectionId)! || a.x0 - b.x0)
    .map((s) => ({ spine: s, record: recordsById.get(s.recordId!)! }));
  if (placed.length < 2) return { kind: "unknown" };

  // Work out whether these shelves file solo artists by surname.
  const bySurname = disorder(placed.map((p) => surnameSortKey(p.record))) < disorder(placed.map((p) => sortKey(p.record)));
  const keyOf = bySurname ? surnameSortKey : sortKey;
  const anchors = placed.map((p) => ({ ...p, key: keyOf(p.record) }));

  const key = keyOf(record);
  // Walking the shelves in physical order, the record belongs just before the
  // first located spine that sorts after it.
  const nextIdx = anchors.findIndex((a) => a.key > key);
  const next = nextIdx >= 0 ? anchors[nextIdx] : undefined;
  const prev = nextIdx === -1 ? anchors[anchors.length - 1] : nextIdx > 0 ? anchors[nextIdx - 1] : undefined;

  const pad = 0.04;
  if (prev && next && prev.spine.sectionId === next.spine.sectionId) {
    const section = sectionById.get(prev.spine.sectionId)!;
    return { kind: "estimate", section, x0: Math.max(0, prev.spine.x1 - pad / 2), x1: Math.min(1, next.spine.x0 + pad / 2), after: prev.record, before: next.record };
  }
  if (prev) {
    const section = sectionById.get(prev.spine.sectionId)!;
    return { kind: "estimate", section, x0: Math.max(0, prev.spine.x1 - pad / 2), x1: Math.min(1, prev.spine.x1 + 0.2), after: prev.record, before: next?.record };
  }
  const section = sectionById.get(next!.spine.sectionId)!;
  return { kind: "estimate", section, x0: Math.max(0, next!.spine.x0 - 0.2), x1: Math.min(1, next!.spine.x0 + pad / 2), before: next!.record };
}
