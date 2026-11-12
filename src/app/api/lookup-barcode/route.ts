// Look up a record by the barcode on its sleeve. MusicBrainz needs no key;
// Discogs is tried too when DISCOGS_TOKEN is set (its search requires auth).
export const runtime = "nodejs";

const UA = "Waxstack/0.1 ( https://waxstack-psi.vercel.app )";

export interface LookupResult {
  artist: string;
  title: string;
  label?: string;
  catno?: string;
  year?: number;
  coverUrl?: string;
  discogsId?: number;
  source: "musicbrainz" | "discogs";
}

function authorised(req: Request) {
  const code = process.env.ACCESS_CODE;
  return !code || req.headers.get("x-access-code")?.trim().toLowerCase() === code.trim().toLowerCase();
}

async function fromMusicBrainz(barcode: string): Promise<LookupResult[]> {
  const url = `https://musicbrainz.org/ws/2/release?query=barcode:${encodeURIComponent(barcode)}&fmt=json&limit=5`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  type Rel = {
    id: string;
    title: string;
    date?: string;
    "artist-credit"?: { name: string; joinphrase?: string }[];
    "label-info"?: { "catalog-number"?: string; label?: { name: string } }[];
    "cover-art-archive"?: { front?: boolean };
  };
  return ((data.releases ?? []) as Rel[]).map((r) => ({
    artist: (r["artist-credit"] ?? []).map((a) => a.name + (a.joinphrase ?? "")).join("").trim() || "Unknown artist",
    title: r.title,
    label: r["label-info"]?.[0]?.label?.name,
    catno: r["label-info"]?.[0]?.["catalog-number"],
    year: r.date ? parseInt(r.date.slice(0, 4), 10) || undefined : undefined,
    coverUrl: `https://coverartarchive.org/release/${r.id}/front-250`,
    source: "musicbrainz" as const,
  }));
}

async function fromDiscogs(barcode: string): Promise<LookupResult[]> {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) return [];
  const url = `https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release&per_page=5`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Authorization: `Discogs token=${token}` }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  type Hit = { id: number; title: string; year?: string; label?: string[]; catno?: string; thumb?: string };
  return ((data.results ?? []) as Hit[]).map((h) => {
    // Discogs titles look like "Artist - Title".
    const [artist, ...rest] = h.title.split(" - ");
    return {
      artist: artist.replace(/ \(\d+\)$/, ""),
      title: rest.join(" - ") || h.title,
      label: h.label?.[0],
      catno: h.catno,
      year: h.year ? parseInt(h.year, 10) || undefined : undefined,
      coverUrl: h.thumb,
      discogsId: h.id,
      source: "discogs" as const,
    };
  });
}

export async function GET(req: Request) {
  if (!authorised(req)) return Response.json({ error: "access-code" }, { status: 401 });
  const barcode = (new URL(req.url).searchParams.get("barcode") ?? "").replace(/\D/g, "");
  if (barcode.length < 8 || barcode.length > 14) return Response.json({ error: "That doesn't look like a barcode." }, { status: 400 });
  try {
    const [discogs, mb] = await Promise.all([fromDiscogs(barcode), fromMusicBrainz(barcode)]);
    // Prefer Discogs (it has catalogue ids collectors use), then MusicBrainz.
    const seen = new Set<string>();
    const results = [...discogs, ...mb].filter((r) => {
      const k = `${r.artist}|${r.title}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return Response.json({ results: results.slice(0, 5) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Barcode lookup failed. Try a photo of the sleeve instead." }, { status: 502 });
  }
}
