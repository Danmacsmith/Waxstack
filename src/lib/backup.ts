import { db, type Section } from "./db";

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportBackup() {
  const [records, sections, spines] = await Promise.all([db.records.toArray(), db.sections.toArray(), db.spines.toArray()]);
  const data = {
    app: "waxstack",
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
    spines,
    sections: await Promise.all(sections.map(async (s) => ({ ...s, photo: await blobToDataUrl(s.photo) }))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `waxstack-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text());
  if (data?.app !== "waxstack") throw new Error("That isn't a Waxstack backup file.");
  const sections: Section[] = await Promise.all(
    data.sections.map(async (s: Omit<Section, "photo"> & { photo: string }) => ({
      ...s,
      photo: await (await fetch(s.photo)).blob(),
      status: s.status === "scanning" ? "scanned" : s.status,
    })),
  );
  await db.transaction("rw", db.records, db.sections, db.spines, async () => {
    await Promise.all([db.records.clear(), db.sections.clear(), db.spines.clear()]);
    await db.records.bulkAdd(data.records);
    await db.sections.bulkAdd(sections);
    await db.spines.bulkAdd(data.spines);
  });
}
