import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, MODEL, readJson } from "../../../lib/ai";
import { NOTES_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { getOwnedUpload } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";

// Vercel gives a function 10 seconds unless it is told otherwise, and an AI
// answer of any length takes longer than that. Without this line the request is
// killed mid-generation and the user sees a failure with nothing in the logs.
export const maxDuration = 60;

// A pasted passage is capped by the plan rule, but a file the student already
// spent an upload on gets the fuller budget: cutting it to 8k would quietly
// drop most of a lecture handout.
const FILE_BUDGET = 24_000;

export async function POST(req: Request) {
  const g = await guard(req, "notes");
  if (!g.ok) return g.res;

  const body = await readJson(req);
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
    source = up.file_name;
    // Anything typed alongside the file is an instruction about it, not the material.
    text = text ? `${fileText}\n\n---\nThe student also asked: ${text}` : fileText;
  }

  if (!text) return NextResponse.json({ error: "Text cannot be empty." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      messages: [
        { role: "system", content: NOTES_SYSTEM },
        { role: "user", content: `Generate detailed, structured study notes from this text:\n\n${text}` },
      ],
    });
    const notes = res.choices[0]?.message?.content;
    if (!notes) throw new Error("Empty AI response");

    // Save to the user's notes history (best effort: never fail the request because of it).
    let id: string | null = null;
    try {
      const title = (source || text).replace(/\s+/g, " ").slice(0, 60);
      const { data } = await supabaseAdmin()
        .from("notes_history").insert({ user_id: g.auth.user.id, title, content: notes }).select("id").single();
      id = (data?.id as string) ?? null;
    } catch (e) {
      console.error("notes history save failed:", e);
    }
    return NextResponse.json({ notes, id });
  } catch (err) {
    console.error("notes error:", err);
    captureRouteError(err, req, { route: "/api/notes", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Failed to generate notes.") }, { status: 500 });
  }
}
