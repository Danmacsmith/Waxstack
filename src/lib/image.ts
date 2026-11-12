/** Load a photo, respecting EXIF orientation, and downscale to a sensible size. */
export async function preparePhoto(file: Blob, maxEdge = 4032): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode photo"))), "image/jpeg", 0.9));
  return { blob, width, height };
}

export interface Strip {
  index: number;
  count: number;
  /** Fraction of the full photo width where this strip starts / ends. */
  from: number;
  to: number;
  base64: string;
  /** Pixel size of the encoded strip image. */
  width: number;
  height: number;
}

/**
 * Cut the photo into overlapping vertical strips. Spines are tall and thin,
 * so a strip about half as wide as it is tall keeps their text legible after
 * the API's own downscaling, without slicing any spine's text in half.
 */
export async function cutStrips(photo: Blob, width: number, height: number): Promise<Strip[]> {
  const count = Math.min(10, Math.max(2, Math.round((2 * width) / height)));
  const overlap = 0.06; // of full width, so spines on a boundary appear whole in one strip
  const step = 1 / count;
  const bmp = await createImageBitmap(photo);
  const strips: Strip[] = [];
  // Claude Opus 5.5 reads images up to 2576px on the long edge and roughly
  // 3.5 megapixels; anything bigger is downscaled by the API anyway.
  const LONG_EDGE = 2576;
  const MAX_PIXELS = 3_500_000;
  for (let i = 0; i < count; i++) {
    const from = Math.max(0, i * step - overlap / 2);
    const to = Math.min(1, (i + 1) * step + overlap / 2);
    const sx = Math.round(from * width);
    const sw = Math.round((to - from) * width);
    const scale = Math.min(1, LONG_EDGE / Math.max(sw, height), Math.sqrt(MAX_PIXELS / (sw * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, sx, 0, sw, height, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    strips.push({ index: i, count, from, to, base64, width: canvas.width, height: canvas.height });
  }
  bmp.close();
  return strips;
}
