// Proxy for Discogs public collections. Browsers can't set the User-Agent
// header Discogs requires, so the server fetches on the client's behalf.
export const runtime = "nodejs";

const UA = "Waxstack/0.1 (+https://github.com/)";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = (url.searchParams.get("username") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username)) {
    return Response.json({ error: "Enter a valid Discogs username." }, { status: 400 });
  }

  const target = new URL(`https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0/releases`);
  target.searchParams.set("per_page", "100");
  target.searchParams.set("page", String(page));
  target.searchParams.set("sort", "artist");

  const headers: Record<string, string> = { "User-Agent": UA };
  if (process.env.DISCOGS_TOKEN) headers.Authorization = `Discogs token=${process.env.DISCOGS_TOKEN}`;

  const res = await fetch(target, { headers, cache: "no-store" });
  if (res.status === 404) return Response.json({ error: "No Discogs user with that name." }, { status: 404 });
  if (res.status === 403 || res.status === 401) {
    return Response.json({ error: "That collection is private. Make it public in Discogs settings, or import the CSV export instead." }, { status: 403 });
  }
  if (res.status === 429) return Response.json({ error: "Discogs is rate limiting us. Wait a minute and try again." }, { status: 429 });
  if (!res.ok) return Response.json({ error: `Discogs error ${res.status}` }, { status: 502 });

  const data = await res.json();
  type Rel = {
    id: number;
    basic_information: {
      title: string;
      year: number;
      cover_image?: string;
      thumb?: string;
      artists: { name: string }[];
      labels: { name: string; catno: string }[];
      genres?: string[];
      styles?: string[];
    };
  };
  const records = (data.releases as Rel[]).map((r) => {
    const b = r.basic_information;
    return {
      discogsId: r.id,
      artist: b.artists.map((a) => a.name.replace(/ \(\d+\)$/, "")).join(", "),
      title: b.title,
      label: b.labels[0]?.name,
      catno: b.labels[0]?.catno,
      year: b.year || undefined,
      genre: [...(b.genres ?? []), ...(b.styles ?? [])].slice(0, 3).join(", ") || undefined,
      coverUrl: b.thumb || b.cover_image,
    };
  });
  return Response.json({ records, page: data.pagination.page, pages: data.pagination.pages, total: data.pagination.items });
}
