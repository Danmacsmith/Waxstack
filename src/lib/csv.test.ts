import { describe, expect, it } from "vitest";
import { parseCsv, recordsFromCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, commas and escaped quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("recordsFromCsv", () => {
  it("reads a Discogs collection export", () => {
    const csv = [
      "Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added",
      'SF 8244,David Bowie,Hunky Dory,RCA Victor,"LP, Album",,1971,1234,Uncategorized,2024-01-01',
      "K 56344,Fleetwood Mac (2),Rumours,Warner Bros.,LP,,1977,5678,Uncategorized,2024-01-02",
    ].join("\r\n");
    const out = recordsFromCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ artist: "David Bowie", title: "Hunky Dory", catno: "SF 8244", year: 1971, discogsId: 1234 });
    expect(out[1].artist).toBe("Fleetwood Mac"); // Discogs "(2)" suffix removed
  });

  it("reads a simple Artist/Title sheet", () => {
    expect(recordsFromCsv("artist,album\nBlur,Parklife")).toEqual([{ artist: "Blur", title: "Parklife", label: undefined, catno: undefined, year: undefined, discogsId: undefined }]);
  });

  it("explains a missing column", () => {
    expect(() => recordsFromCsv("name,notes\nx,y")).toThrow(/Artist column/);
  });
});
