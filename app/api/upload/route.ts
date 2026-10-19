import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { MODEL, complete } from "../../../lib/ai";
import { classify, extractDocx, extractPdf, extractPlainText, sniffLooksRight } from "../../../lib/extract";
import { BUCKET, SIZE_LIMITS, storagePath } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIME_BY_KIND = { pdf: "document", docx: "document", text: "document", image: "image", audio: "audio" } as const;

export async function POST(req: Request) {
  const g = await guard(req, "upload");
  if (!g.ok) return g.res;

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Could not read the upload." }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file was attached." }, { status: 400 });

  const kind = classify(file.type || "", file.name || "");
  if (kind === "unsupported")
    return NextResponse.json(
      { error: "That file type is not supported. Use a PDF, Word file, text file, image or audio recording." },
      { status: 415 }
    );

  const group = MIME_BY_KIND[kind];
  const limit = SIZE_LIMITS[group];
  if (file.size > limit)
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit for this type is ${Math.round(limit / 1048576)} MB.` },
      { status: 413 }
    );
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffLooksRight(kind, bytes))
    return NextResponse.json({ error: "That file's contents do not match its type. It may be renamed or damaged." }, { status: 415 });

  // Only count the upload once we know we will actually store it.
  const blocked = await g.consume();
  if (blocked) return blocked;

  const db = supabaseAdmin();
  const userId = g.auth.user.id;
  const safeName = (file.name || "file").replace(/[\r\n\t]/g, " ").slice(0, 140);

  const { data: row, error: insErr } = await db.from("uploads").insert({
    user_id: userId, file_name: safeName, mime_type: file.type || "application/octet-stream",
    size_bytes: file.size, kind: group, storage_path: "pending", status: "processing",
  }).select("id").single();

  if (insErr || !row) {
    console.error("upload insert failed:", insErr?.message);
    await g.refund();
    return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }

  const path = storagePath(userId, row.id, safeName);
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream", upsert: true,
  });
  if (upErr) {
    console.error("storage upload failed:", upErr.message);
    await db.from("uploads").update({ status: "failed", error: "storage" }).eq("id", row.id);
    await g.refund();
    return NextResponse.json({ error: "Could not store the file. Please try again." }, { status: 500 });
  }
  await db.from("uploads").update({ storage_path: path }).eq("id", row.id);

  // Read the file. A failure here is the file's problem, not the upload's, so the
  // row stays and the user is told what went wrong.
  try {
    let text = "", pages: number | null = null;

    if (kind === "pdf") { const r = await extractPdf(bytes); text = r.text; pages = r.pages ?? null; }
    else if (kind === "docx") text = extractDocx(bytes).text;
    else if (kind === "text") text = extractPlainText(bytes).text;
    else if (kind === "image") {
      const b64 = Buffer.from(bytes).toString("base64");
      const res = await complete({
        model: MODEL, max_tokens: 1500, temperature: 0.2,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Read this image for a student. Write out every word, number, formula and label exactly as shown, keeping the layout order. If it is a diagram, chart or handwriting, describe what it shows after the transcription. Do not solve anything." },
            { type: "image_url", image_url: { url: `data:${file.type || "image/png"};base64,${b64}`, detail: "high" } },
          ],
        }],
      });
      text = res.choices[0]?.message?.content?.trim() ?? "";
    }
    else if (kind === "audio") {
      await db.from("uploads").update({ status: "ready", extracted_text: "" }).eq("id", row.id);
      return NextResponse.json({ id: row.id, name: safeName, kind: "audio", status: "ready", needsTranscript: true });
    }

    if (!text.trim()) {
      await db.from("uploads").update({ status: "failed", error: "no text" }).eq("id", row.id);
      return NextResponse.json({
        id: row.id, status: "failed",
        error: kind === "pdf"
          ? "No text could be read. This PDF is probably a scan — upload it as an image instead."
          : "No readable text was found in that file.",
      }, { status: 422 });
    }

    await db.from("uploads").update({ status: "ready", extracted_text: text, pages }).eq("id", row.id);
    return NextResponse.json({
      id: row.id, name: safeName, kind: group, status: "ready", pages,
      chars: text.length, preview: text.slice(0, 280),
    });
  } catch (err) {
    console.error("extraction failed:", err);
    captureRouteError(err, req, { route: "/api/upload", status: 500 });
    await db.from("uploads").update({ status: "failed", error: "extract" }).eq("id", row.id);
    return NextResponse.json({ id: row.id, status: "failed", error: "The file uploaded but could not be read. It may be damaged or password protected." }, { status: 422 });
  }
}

export async function GET(req: Request) {
  const g = await guard(req, "upload");
  if (!g.ok) return g.res;
  const { data } = await supabaseAdmin()
    .from("uploads").select("id,file_name,mime_type,size_bytes,kind,status,pages,error,created_at")
    .eq("user_id", g.auth.user.id).order("created_at", { ascending: false }).limit(40);
  return NextResponse.json({ uploads: data ?? [] });
}
