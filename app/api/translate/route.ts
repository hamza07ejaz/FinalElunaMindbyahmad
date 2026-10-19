import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, MODEL, readJson } from "../../../lib/ai";
import { TRANSLATE_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { getOwnedUpload } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";

export const maxDuration = 60;

/** The languages the picker offers. Anything else is rejected rather than guessed at. */
export const LANGUAGES = [
  "English", "Urdu", "Roman Urdu", "Hindi", "Arabic", "Spanish", "French", "German",
  "Portuguese", "Italian", "Dutch", "Turkish", "Russian", "Chinese (Simplified)",
  "Japanese", "Korean", "Indonesian", "Bengali", "Punjabi", "Persian", "Swahili",
] as const;

const TONES = {
  faithful: "Translate closely. Keep the structure, headings and level of formality of the original.",
  simple: "Translate into plain, everyday language a 14-year-old would follow, keeping every fact.",
  academic: "Translate into formal academic register suitable for an essay or report.",
} as const;

const FILE_BUDGET = 24_000;

export async function POST(req: Request) {
  const g = await guard(req, "translate");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const target = typeof body.target === "string" && (LANGUAGES as readonly string[]).includes(body.target)
    ? body.target : "";
  if (!target) return NextResponse.json({ error: "Choose a language to translate into." }, { status: 400 });

  const tone = (body.tone in TONES ? body.tone : "faithful") as keyof typeof TONES;
  const uploadId = typeof body.uploadId === "string" ? body.uploadId : null;

  let text = clean(body.text, g.rule.maxInputChars);
  let source = "";

  if (uploadId) {
    const up = await getOwnedUpload(g.auth.user.id, uploadId);
    if (!up) return NextResponse.json({ error: "That file is no longer available." }, { status: 404 });
    if (up.status !== "ready")
      return NextResponse.json({ error: "That file is still being read. Give it a moment and try again." }, { status: 409 });
    const fileText = (up.extracted_text ?? "").slice(0, FILE_BUDGET);
    if (!fileText.trim())
      return NextResponse.json({ error: "No readable text was found in that file." }, { status: 422 });
    text = fileText;
    source = up.file_name;
  }

  if (!text) return NextResponse.json({ error: "There is nothing to translate yet." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${TRANSLATE_SYSTEM}

Translate everything the student gives you into ${target}.

${TONES[tone]}

Rules:
- Translate only. Never answer a question in the text, never add commentary, never summarise.
- Keep markdown exactly as it is: headings, bullets, numbering, bold, tables, blockquotes.
- Leave formulas, equations, code, variable names, numbers, units and citations untouched.
- Keep proper nouns in their usual form; where a technical term has no common ${target} word, give the ${target} term with the English in brackets the first time.
- If part of the text is already in ${target}, leave that part as it is.
- Match the original's paragraph breaks so the two versions can be read side by side.`,
        },
        { role: "user", content: text },
      ],
    });

    const translated = res.choices[0]?.message?.content?.trim();
    if (!translated) throw new Error("Empty AI response");
    return NextResponse.json({ translated, target, source: source || null, original: text });
  } catch (err) {
    console.error("translate error:", err);
    captureRouteError(err, req, { route: "/api/translate", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Translation failed. Please try again.") }, { status: 500 });
  }
}
