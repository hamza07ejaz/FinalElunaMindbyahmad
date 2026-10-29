import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { MODEL, complete } from "../../../lib/ai";
import {
  classify, extractDocx, extractEpub, extractPdf, extractPlainText, extractPptx,
  extractRtf, extractXlsx, renderPdfPages, sniffLooksRight,
} from "../../../lib/extract";
import { BUCKET, SIZE_LIMITS, storagePath } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";
import { notes } from "../../../lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIME_BY_KIND = {
  pdf: "document", docx: "document", pptx: "document", xlsx: "document",
  epub: "document", rtf: "document", text: "document",
  image: "image", audio: "audio",
} as const;

/** How many pages of a scanned PDF to read. Each one is a vision call. */
const SCAN_PAGES = 5;

const READ_IMAGE_PROMPT =
  "Read this image for a student. Write out every word, number, formula and label exactly as shown, " +
  "keeping the layout order. If it is a diagram, chart or handwriting, describe what it shows after " +
  "the transcription. Do not solve anything.";

/** One rendered page, read by the vision model. */
async function readImage(dataUrl: string, page: number, of: number): Promise<string> {
  const res = await complete({
    model: MODEL, max_tokens: 1500, temperature: 0.2,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `${READ_IMAGE_PROMPT} This is page ${page} of ${of}.` },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
    }],
  });
  const t = res.choices[0]?.message?.content?.trim() ?? "";
  return t ? `--- Page ${page} ---\n${t}` : "";
}

/**
 * Say what actually went wrong.
 *
 * Every extraction failure used to come back as "It may be damaged or password
 * protected" — a guess, stated as fact, about a file that was usually neither.
 * The one time it mattered most it was actively misleading: a server missing a
 * library told hundreds of students their coursework was corrupt.
 *
 * The distinction worth drawing is whose problem it is. A password or a scan is
 * something the person can act on. Anything else is ours, and saying so plainly
 * is both more honest and more likely to get it reported.
 */
function explainExtractFailure(message: string, kind: string): string {
  const m = message.toLowerCase();

  if (/password|encrypted/.test(m))
    return "That file is password protected. Remove the password and upload it again.";

  if (/dommatrix|canvas|cannot find module|is not defined|not available on this server/.test(m))
    return "This server cannot read that type of file at the moment. Nothing is wrong with your file — please report it.";

  if (/invalid|corrupt|malformed|bad xref|unexpected end/.test(m))
    return `That ${kind === "pdf" ? "PDF" : "file"} appears to be damaged. Try opening and re-saving it, then upload again.`;

  if (/timeout|timed out|aborted/.test(m))
    return "Reading that file took too long. A smaller file, or fewer pages, usually works.";

  return "The file uploaded but could not be read. This is a problem on our side, not with your file.";
}

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
      { error: "That file type is not supported. Use a PDF, Word, PowerPoint, Excel, EPUB, RTF or text file, an image, or an audio recording." },
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
    let text = "", pages: number | null = null, scanned = false;

    if (kind === "pdf") {
      const r = await extractPdf(bytes);
      text = r.text; pages = r.pages ?? null;

      /*
       * A PDF with no text layer is a picture of a page, not a page.
       *
       * These used to be a dead end: the upload failed and the student was told
       * to "upload it as an image instead", which means opening the file and
       * screenshotting every page by hand. Rendering the pages here and reading
       * them the same way an uploaded photo is read turns the commonest kind of
       * unusable coursework — the scanned handout — into something the tools
       * can work with.
       */
      if (!text.trim()) {
        const shots = await renderPdfPages(bytes, SCAN_PAGES);
        if (shots.length) {
          // allSettled, not all: five vision calls against a slow provider can
          // outlast the function itself, and three pages of a scanned handout
          // is worth far more to a student than an error saying the file could
          // not be read. Whatever came back is kept, in page order.
          const read = await Promise.allSettled(
            shots.map((url, i) => readImage(url, i + 1, shots.length)),
          );
          text = read
            .map((r) => (r.status === "fulfilled" ? r.value : ""))
            .filter(Boolean)
            .join("\n\n");
          const missed = read.filter((r) => r.status === "rejected").length;
          if (missed) console.warn(`scan: ${missed} of ${shots.length} pages could not be read`);
          scanned = true;
        }
      }
    }
    else if (kind === "docx") text = extractDocx(bytes).text;
    else if (kind === "pptx") { const r = extractPptx(bytes); text = r.text; pages = r.pages ?? null; }
    else if (kind === "xlsx") { const r = extractXlsx(bytes); text = r.text; pages = r.pages ?? null; }
    else if (kind === "epub") { const r = extractEpub(bytes); text = r.text; pages = r.pages ?? null; }
    else if (kind === "rtf") text = extractRtf(bytes).text;
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
          ? "No text could be read from that PDF, and reading the pages as images did not work either."
          : "No readable text was found in that file.",
      }, { status: 422 });
    }

    await db.from("uploads").update({ status: "ready", extracted_text: text, pages }).eq("id", row.id);
    notes.uploadReady(userId, safeName);
    return NextResponse.json({
      id: row.id, name: safeName, kind: group, status: "ready", pages,
      chars: text.length, preview: text.slice(0, 280),
      // Worth saying: the student should know the first pages were read by
      // eye, and that a long scan was not read in full.
      ...(scanned ? { scanned: true, scannedPages: Math.min(pages ?? SCAN_PAGES, SCAN_PAGES) } : {}),
    });
  } catch (err) {
    console.error("extraction failed:", err);
    captureRouteError(err, req, { route: "/api/upload", status: 500 });
    // Store what actually went wrong, not the word "extract". The admin reads
    // this column when someone reports a file that will not open, and a row
    // saying "extract" has never once helped anybody.
    const raw = (err as Error)?.message ?? String(err);
    await db.from("uploads").update({ status: "failed", error: raw.slice(0, 300) }).eq("id", row.id);
    notes.uploadFailed(userId, safeName, explainExtractFailure(raw, kind));
    return NextResponse.json({ id: row.id, status: "failed", error: explainExtractFailure(raw, kind) }, { status: 422 });
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
