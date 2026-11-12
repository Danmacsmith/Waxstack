import { db, type Section, type Spine, type VinylRecord } from "./db";

// Sample data so people can try searching before photographing anything.
// Everything here has ids starting "demo-" so it can be removed cleanly.

const ALBUMS: [string, string][] = [
  ["ABBA", "Arrival"], ["Aphex Twin", "Selected Ambient Works 85-92"], ["Arctic Monkeys", "AM"], ["Beach House", "Bloom"],
  ["The Beatles", "Abbey Road"], ["Björk", "Homogenic"], ["Blur", "Parklife"], ["David Bowie", "Hunky Dory"],
  ["Kate Bush", "Hounds of Love"], ["The Clash", "London Calling"], ["Leonard Cohen", "Songs of Leonard Cohen"], ["The Cure", "Disintegration"],
  ["Daft Punk", "Discovery"], ["Miles Davis", "Kind of Blue"], ["Nick Drake", "Pink Moon"], ["Bob Dylan", "Blood on the Tracks"],
  ["Fleetwood Mac", "Rumours"], ["Marvin Gaye", "What's Going On"], ["Gorillaz", "Demon Days"], ["Jimi Hendrix", "Electric Ladyland"],
  ["Joy Division", "Unknown Pleasures"], ["Kraftwerk", "Autobahn"], ["Led Zeppelin", "IV"], ["Joni Mitchell", "Blue"],
  ["Massive Attack", "Mezzanine"], ["Nirvana", "Nevermind"], ["Oasis", "Definitely Maybe"], ["Pink Floyd", "The Dark Side of the Moon"],
  ["Portishead", "Dummy"], ["Prince", "Purple Rain"], ["Radiohead", "OK Computer"], ["The Smiths", "The Queen Is Dead"],
  ["Stevie Wonder", "Songs in the Key of Life"], ["Talking Heads", "Remain in Light"], ["Tame Impala", "Currents"],
  ["The Velvet Underground", "The Velvet Underground & Nico"], ["Tom Waits", "Rain Dogs"], ["The xx", "xx"], ["Neil Young", "Harvest"], ["Frank Zappa", "Hot Rats"],
];

// These spines are left "unreadable" to show the A–Z estimate.
const UNREAD = new Set([7, 27]);

const SLEEVES = ["#d9cdb8", "#1d1d1d", "#8a2c22", "#2f4f6f", "#e8c547", "#efefef", "#4b6b3a", "#6d3b6b", "#c97a2b", "#222b3a"];

async function drawShelf(albums: [string, string][], seed: number) {
  const W = 1800;
  const H = 1400;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#3b2a1d";
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#2a1d13";
  x.fillRect(0, 0, W, 90);
  x.fillRect(0, H - 90, W, 90);
  const pos: [number, number][] = [];
  let cx = 60;
  const w = (W - 120) / albums.length;
  albums.forEach(([artist, title], i) => {
    const sw = w * (0.75 + ((i * 7 + seed) % 5) / 10);
    const colour = (i * 3 + seed) % SLEEVES.length;
    x.fillStyle = SLEEVES[colour];
    x.fillRect(cx, 100, sw - 3, H - 200);
    x.save();
    x.translate(cx + sw / 2, H / 2);
    x.rotate(Math.PI / 2);
    x.fillStyle = [0, 4, 5].includes(colour) ? "#1d1d1d" : "#efefef";
    x.font = "bold 22px sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(`${artist}  ${title}`.toUpperCase(), 0, 0);
    x.restore();
    pos.push([cx / W, (cx + sw - 3) / W]);
    cx += sw;
  });
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
  return { blob, W, H, pos };
}

export async function loadDemo() {
  const now = Date.now();
  const records: VinylRecord[] = ALBUMS.map(([artist, title], i) => ({ id: `demo-r${i}`, artist, title, source: "manual", createdAt: now }));
  const halves = [records.slice(0, 20), records.slice(20)];
  const order = (await db.sections.count()) ? (await db.sections.orderBy("order").last())!.order + 1 : 0;
  const sections: Section[] = [];
  const spines: Spine[] = [];
  for (const [h, recs] of halves.entries()) {
    const shelf = await drawShelf(recs.map((r) => [r.artist, r.title]), h * 3 + 1);
    const sectionId = `demo-s${h}`;
    sections.push({ id: sectionId, name: h === 0 ? "Sample: top left" : "Sample: top right", order: order + h, photo: shelf.blob, width: shelf.W, height: shelf.H, sortRule: "artist-az", status: "scanned", scannedAt: now, createdAt: now });
    recs.forEach((r, i) => {
      const n = h * 20 + i;
      const unread = UNREAD.has(n);
      spines.push({ id: `demo-sp${n}`, sectionId, x0: shelf.pos[i][0], x1: shelf.pos[i][1], text: unread ? "" : `${r.artist} ${r.title}`.toUpperCase(), recordId: unread ? undefined : r.id, matchedBy: unread ? undefined : "vision", confidence: unread ? "low" : "high" });
    });
  }
  await db.transaction("rw", db.records, db.sections, db.spines, async () => {
    await db.records.bulkPut(records);
    await db.sections.bulkPut(sections);
    await db.spines.bulkPut(spines);
  });
}

export async function clearDemo() {
  await db.transaction("rw", db.records, db.sections, db.spines, async () => {
    await db.records.where("id").startsWith("demo-").delete();
    await db.sections.where("id").startsWith("demo-").delete();
    await db.spines.where("id").startsWith("demo-").delete();
    // Spines from real photos that got linked to a sample record.
    await db.spines.filter((s) => !!s.recordId?.startsWith("demo-")).modify({ recordId: undefined, matchedBy: undefined });
  });
}

export const hasDemo = async () => (await db.sections.where("id").startsWith("demo-").count()) > 0;
