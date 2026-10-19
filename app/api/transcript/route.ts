import { NextResponse } from "next/server";
import { MODEL, complete, readJson } from "../../../lib/ai";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { TranscribeError, notesPrompt, transcribeAudio } from "../../../lib/transcribe";
import { BUCKET, getOwnedUpload } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";

export const runtime = "nodejs";
// 60 is the ceiling on Vercel's lower plans; asking for more fails the deploy.
// The 12 MB upload cap is what keeps transcription inside it.
export const maxDuration = 60;

const LANGS = ["auto", "en", "ur", "hi", "ar", "es", "fr", "de", "zh", "pt", "ru", "tr", "id"] as const;

export async function POST(req: Request) {
  const g = await guard(req, "transcript");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
  if (!uploadId) return NextResponse.json({ error: "Upload a recording first." }, { status: 400 });

  const language = LANGS.includes(body.language) ? (body.language as string) : "auto";
  const wantNotes = body.notes !== false;

  const db = supabaseAdmin();
  const up = await getOwnedUpload(g.auth.user.id, uploadId);
  if (!up) return NextResponse.json({ error: "That recording is no longer available." }, { status: 404 });
  if (up.kind !== "audio")
    return NextResponse.json({ error: "That file is not a recording. Upload an audio file to transcribe." }, { status: 400 });

  // Already transcribed: hand it back without spending another use.
  const existing = (up.extracted_text ?? "").trim();
  if (existing) {
    const notes = wantNotes ? await summarise(existing, up.file_name, g.rule.maxTokens).catch(() => null) : null;
    return NextResponse.json({ transcript: existing, notes, cached: true, name: up.file_name });
  }

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(up.storage_path);
    if (dlErr || !blob) {
      await g.refund();
      return NextResponse.json({ error: "Could not open that recording. Try uploading it again." }, { status: 500 });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const { text } = await transcribeAudio(bytes, up.file_name, up.mime_type, language);

    await db.from("uploads").update({ status: "ready", extracted_text: text }).eq("id", up.id);

    // Notes are a bonus on top of the transcript: if they fail, the transcript
    // is still what the student paid a use for, so it is returned either way.
    const notes = wantNotes ? await summarise(text, up.file_name, g.rule.maxTokens).catch((e) => {
      console.error("transcript notes failed:", e);
      return null;
    }) : null;

    return NextResponse.json({ transcript: text, notes, name: up.file_name, chars: text.length });
  } catch (err) {
    await g.refund();
    if (err instanceof TranscribeError)
      return NextResponse.json({ error: err.message }, { status: err.kind === "unsupported" ? 413 : 502 });
    console.error("transcript error:", err);
    captureRouteError(err, req, { route: "/api/transcript", status: 500 });
    return NextResponse.json({ error: "Transcription failed. Please try again with a shorter or clearer recording." }, { status: 500 });
  }
}

async function summarise(transcript: string, fileName: string, maxTokens: number) {
  const res = await complete({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.3,
    messages: [
      { role: "system", content: notesPrompt(fileName) },
      { role: "user", content: transcript.slice(0, 40_000) },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || null;
}
