import Dexie, { type EntityTable } from "dexie";

/** A record in the collection. */
export interface VinylRecord {
  id: string;
  artist: string;
  title: string;
  label?: string;
  catno?: string;
  year?: number;
  genre?: string;
  coverUrl?: string;
  discogsId?: number;
  source: "discogs" | "csv" | "manual" | "spine";
  createdAt: number;
}

export type SortRule = "artist-az" | "genre" | "label" | "none";

/** One photographed part of the shelving: a cube, a shelf, a crate. */
export interface Section {
  id: string;
  name: string;
  /** Position in the walk-through order of the whole collection (0, 1, 2…). */
  order: number;
  photo: Blob;
  width: number;
  height: number;
  sortRule: SortRule;
  status: "new" | "scanning" | "scanned" | "error";
  scanError?: string;
  scannedAt?: number;
  createdAt: number;
}

/** A single spine found in a section photo. Coordinates are 0–1 of the photo. */
export interface Spine {
  id: string;
  sectionId: string;
  x0: number;
  x1: number;
  text: string;
  recordId?: string;
  /** How the record was linked: by Claude, by fuzzy text match, or by the user. */
  matchedBy?: "vision" | "text" | "user";
  confidence: "high" | "medium" | "low";
}

class WaxstackDB extends Dexie {
  records!: EntityTable<VinylRecord, "id">;
  sections!: EntityTable<Section, "id">;
  spines!: EntityTable<Spine, "id">;

  constructor() {
    super("waxstack");
    this.version(1).stores({
      records: "id, artist, title, discogsId, createdAt",
      sections: "id, order, createdAt",
      spines: "id, sectionId, recordId",
    });
  }
}

export const db = new WaxstackDB();

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
