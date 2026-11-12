/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, newlines in fields). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export interface CsvRecord {
  artist: string;
  title: string;
  label?: string;
  catno?: string;
  year?: number;
  discogsId?: number;
}

/**
 * Reads a Discogs collection export, or any CSV with Artist and Title columns.
 */
export function recordsFromCsv(text: string): CsvRecord[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iArtist = col("artist", "artists", "artist name");
  const iTitle = col("title", "album", "release", "album title");
  if (iArtist < 0 || iTitle < 0) throw new Error("The CSV needs an Artist column and a Title column.");
  const iLabel = col("label", "record label");
  const iCat = col("catalog#", "catalog #", "catno", "catalogue number", "cat no", "catalog number");
  const iYear = col("released", "year");
  const iId = col("release_id", "discogs id", "release id");
  return rows.slice(1).flatMap((r) => {
    const artist = (r[iArtist] ?? "").replace(/ \(\d+\)$/, "").trim();
    const title = (r[iTitle] ?? "").trim();
    if (!artist && !title) return [];
    const year = iYear >= 0 ? parseInt(r[iYear] ?? "", 10) : NaN;
    const id = iId >= 0 ? parseInt(r[iId] ?? "", 10) : NaN;
    return [
      {
        artist,
        title,
        label: iLabel >= 0 ? r[iLabel]?.trim() || undefined : undefined,
        catno: iCat >= 0 ? r[iCat]?.trim() || undefined : undefined,
        year: Number.isFinite(year) && year > 1800 ? year : undefined,
        discogsId: Number.isFinite(id) ? id : undefined,
      },
    ];
  });
}
