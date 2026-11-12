import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const client = new Anthropic();

const SpineSchema = z.object({
  spines: z.array(
    z.object({
      x_start: z.number().describe("Left edge of the spine, in pixels from the left of this image"),
      x_end: z.number().describe("Right edge of the spine, in pixels from the left of this image"),
      text: z.string().describe("Everything readable on the spine, e.g. 'DAVID BOWIE  HUNKY DORY  RCA'. Empty string if nothing is legible."),
      record_id: z
        .string()
        .describe("The id from the collection list if you are reasonably sure this spine is that record, otherwise an empty string"),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
});

const RequestSchema = z.object({
  image: z.string().min(100), // base64 JPEG, no data: prefix
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  stripIndex: z.number().int(),
  stripCount: z.number().int(),
  collection: z
    .array(z.object({ id: z.string(), artist: z.string(), title: z.string(), label: z.string().optional() }))
    .max(5000)
    .default([]),
});

const SYSTEM = `You read vinyl record spines in photos of record shelves for a collector's "where is it on my shelf" app.

You are shown one vertical strip cut from a larger shelf photo. Records stand upright, spine out, side by side, so each spine is a thin vertical band. Spine text usually runs vertically (top-to-bottom or bottom-to-top), so rotate your reading accordingly.

For every record spine in the strip, left to right:
- Give its left and right edges as x pixel coordinates in this image. Be as precise as you can; neighbouring spines should not overlap much.
- Transcribe whatever is legible: artist, title, label, catalogue number. Partial text is useful; never invent text you cannot see.
- Include spines with no legible text (text "") so the shelf position is still recorded.
- Ignore spines cut off at the strip's left or right edge if less than half is visible; the neighbouring strip covers them.
- If a collection list is provided and a spine clearly matches one entry (by text, or by text plus a well-known spine design), give that entry's id in record_id. Leave record_id empty if unsure; a wrong match is worse than none.
- Ignore things that are not records (books, boxes, the shelf frame, turntable).`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Spine reading isn't set up: ANTHROPIC_API_KEY is missing on the server." }, { status: 500 });
  }
  // Optional shared code for testers, so a public link can't run up the API bill.
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code")?.trim().toLowerCase() !== code.trim().toLowerCase()) {
    return Response.json({ error: "access-code" }, { status: 401 });
  }
  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const collectionText = body.collection.length
    ? body.collection.map((r) => `${r.id} | ${r.artist} – ${r.title}${r.label ? ` [${r.label}]` : ""}`).join("\n")
    : "(no collection list provided)";

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(SpineSchema) },
      system: [
        { type: "text", text: SYSTEM },
        // The collection is identical across every strip of a scan, so cache it.
        { type: "text", text: `Collection list (id | artist – title [label]):\n${collectionText}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.image } },
            {
              type: "text",
              text: `This is strip ${body.stripIndex + 1} of ${body.stripCount}, read left to right. It is ${body.width}×${body.height} pixels. List the record spines in it.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The photo could not be read. Try another photo." }, { status: 422 });
    }
    const parsed = response.parsed_output;
    if (!parsed) return Response.json({ error: "Could not read spines from this strip." }, { status: 502 });

    // Convert pixels to fractions of the strip width for the client.
    const frac = (n: number) => Math.min(1, Math.max(0, n / body.width));
    const spines = parsed.spines
      .map((s) => ({ ...s, x_start: frac(Math.min(s.x_start, s.x_end)), x_end: frac(Math.max(s.x_start, s.x_end)) }))
      .filter((s) => s.x_end - s.x_start > 0.002);
    return Response.json({ spines });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "The server's Claude API key is missing or invalid." }, { status: 500 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Busy right now. Try again in a minute." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error", error.status, error.message);
      // 400s explain themselves (e.g. no credit left); pass the reason on.
      const reason = error.status === 400 ? `: ${error.message.replace(/^\d+\s*/, "").slice(0, 300)}` : ".";
      return Response.json({ error: `Spine reading failed (${error.status})${reason}` }, { status: 502 });
    }
    console.error(error);
    return Response.json({ error: "Spine reading failed." }, { status: 500 });
  }
}
