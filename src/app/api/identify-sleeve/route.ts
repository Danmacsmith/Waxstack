import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Identify a record from a photo of its sleeve (front or back) or label.
export const runtime = "nodejs";
export const maxDuration = 90;

const client = new Anthropic();

const Result = z.object({
  artist: z.string().describe("Artist name as printed, or empty if unknown"),
  title: z.string().describe("Album or single title, or empty if unknown"),
  label: z.string().describe("Record label, or empty"),
  catno: z.string().describe("Catalogue number, or empty"),
  year: z.string().describe("Release year if printed or confidently known, else empty"),
  description: z
    .string()
    .describe("A few words a collector would recognise it by when the text is unhelpful, e.g. 'White label, red ink stamp \"TEST PRESSING\", handwritten B1'. Empty if not needed."),
  confidence: z.enum(["high", "medium", "low"]),
});

const Body = z.object({ image: z.string().min(100) });

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Sleeve reading isn't set up on the server." }, { status: 500 });
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code")?.trim().toLowerCase() !== code.trim().toLowerCase()) {
    return Response.json({ error: "access-code" }, { status: 401 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Result) },
      system: `You identify vinyl records for a collector's cataloguing app, from a photo of the sleeve or of the record's centre label.

Many records arrive in plain paper sleeves, so the centre label is often all there is: printed labels, white labels, test pressings, promos with rubber stamps, stickers or handwriting. Read whatever is there, including stamps and handwriting, and use catalogue numbers and label names to work out the release if you know it.

Never guess. Leave a field empty rather than invent it. When there is little or no readable text, fill in description with what makes this record recognisable (label colour, stamp, sticker, handwriting) so the collector can find it again.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.image } },
            { type: "text", text: "Which record is this? It may be the sleeve or the centre label." },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ error: "Couldn't read that sleeve. Try another photo or type it in." }, { status: 422 });
    }
    const r = response.parsed_output;
    return Response.json({
      artist: r.artist,
      title: r.title,
      label: r.label || undefined,
      catno: r.catno || undefined,
      year: parseInt(r.year, 10) || undefined,
      description: r.description || undefined,
      confidence: r.confidence,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error", error.status, error.message);
      return Response.json({ error: `Sleeve reading failed (${error.status}).` }, { status: 502 });
    }
    console.error(error);
    return Response.json({ error: "Sleeve reading failed." }, { status: 500 });
  }
}
