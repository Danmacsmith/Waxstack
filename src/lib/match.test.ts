import { describe, expect, it } from "vitest";
import type { Section, Spine, VinylRecord } from "./db";
import { bestTextMatch, locate, searchScore, spineScore, surnameSortKey } from "./match";

const rec = (id: string, artist: string, title: string, extra: Partial<VinylRecord> = {}): VinylRecord => ({ id, artist, title, source: "manual", createdAt: 0, ...extra });

describe("spineScore", () => {
  const hunky = rec("1", "David Bowie", "Hunky Dory", { catno: "SF 8244" });
  it("matches clean spine text", () => expect(spineScore("DAVID BOWIE  HUNKY DORY  RCA", hunky)).toBeGreaterThan(0.8));
  it("tolerates OCR slips", () => expect(spineScore("DAVlD B0WIE HUNKY D0RY", hunky)).toBeGreaterThan(0.62));
  it("matches on catalogue number", () => expect(spineScore("RCA SF8244", hunky)).toBeGreaterThanOrEqual(0.9));
  it("rejects a different album by the same artist", () => expect(spineScore("DAVID BOWIE LOW", hunky)).toBeLessThan(0.62));
  it("rejects empty text", () => expect(spineScore("", hunky)).toBe(0));
});

describe("bestTextMatch", () => {
  const records = [rec("a", "David Bowie", "Low"), rec("b", "David Bowie", "Hunky Dory"), rec("c", "Kate Bush", "Hounds of Love")];
  it("picks the right album", () => expect(bestTextMatch("BOWIE HUNKY DORY", records, new Set())?.record.id).toBe("b"));
  it("skips records already placed", () => expect(bestTextMatch("BOWIE HUNKY DORY", records, new Set(["b"]))).toBeNull());
  it("returns null for unrelated text", () => expect(bestTextMatch("MILES DAVIS KIND OF BLUE", records, new Set())).toBeNull());
});

describe("searchScore", () => {
  const r = rec("1", "Talking Heads", "Remain in Light", { label: "Sire" });
  it("finds by artist", () => expect(searchScore("talking heads", r)).toBeGreaterThan(0));
  it("finds by partial word", () => expect(searchScore("remain", r)).toBeGreaterThan(0));
  it("finds by label", () => expect(searchScore("sire", r)).toBeGreaterThan(0));
  it("ignores unrelated queries", () => expect(searchScore("kraftwerk", r)).toBe(0));
});

describe("surnameSortKey", () => {
  it("files people by surname", () => expect(surnameSortKey(rec("1", "David Bowie", "Low")).startsWith("bowie")).toBe(true));
  it("leaves bands alone", () => expect(surnameSortKey(rec("1", "Pink Floyd", "Animals")).startsWith("pink floyd")).toBe(true));
  it("drops a leading The", () => expect(surnameSortKey(rec("1", "The Cure", "Faith")).startsWith("cure")).toBe(true));
  it("leaves '& the' groups alone", () => expect(surnameSortKey(rec("1", "Nick Cave and the Bad Seeds", "Murder Ballads")).startsWith("nick")).toBe(true));
});

describe("locate", () => {
  const section = (id: string, order: number): Section => ({ id, name: id, order, photo: {} as Blob, width: 1000, height: 800, sortRule: "artist-az", status: "scanned", createdAt: 0 });
  const records = [rec("blur", "Blur", "Parklife"), rec("bowie", "David Bowie", "Hunky Dory"), rec("bush", "Kate Bush", "Hounds of Love"), rec("clash", "The Clash", "London Calling"), rec("cohen", "Leonard Cohen", "Songs")];
  const byId = new Map(records.map((r) => [r.id, r]));
  const sections = [section("s1", 0)];
  // Shelf filed by surname: Blur, [Bowie unread], Bush, Clash, Cohen.
  const spines: Spine[] = [
    { id: "1", sectionId: "s1", x0: 0.1, x1: 0.15, text: "", recordId: "blur", confidence: "high" },
    { id: "2", sectionId: "s1", x0: 0.3, x1: 0.35, text: "", recordId: "bush", confidence: "high" },
    { id: "3", sectionId: "s1", x0: 0.5, x1: 0.55, text: "", recordId: "clash", confidence: "high" },
    { id: "4", sectionId: "s1", x0: 0.7, x1: 0.75, text: "", recordId: "cohen", confidence: "high" },
  ];

  it("returns the exact spine when linked", () => {
    const loc = locate(byId.get("bush")!, sections, spines, byId);
    expect(loc.kind).toBe("exact");
  });

  it("estimates an unread record between its A–Z neighbours, by surname", () => {
    const loc = locate(byId.get("bowie")!, sections, spines, byId);
    expect(loc.kind).toBe("estimate");
    if (loc.kind !== "estimate") return;
    expect(loc.after?.id).toBe("blur");
    expect(loc.before?.id).toBe("bush");
    expect(loc.x0).toBeGreaterThanOrEqual(0.1);
    expect(loc.x1).toBeLessThanOrEqual(0.35);
  });

  it("doesn't estimate on unsorted shelves", () => {
    const loose = [{ ...sections[0], sortRule: "none" as const }];
    expect(locate(byId.get("bowie")!, loose, spines, byId).kind).toBe("unknown");
  });
});
