import { NextResponse } from "next/server";
import { MODEL, complete } from "./ai";
import { budget, Expired, type Budget } from "./deadline";
import {
  classify, extractDocx, extractEpub, extractPdf, extractPlainText, extractPptx,
  extractRtf, extractXlsx, renderPdfPages, sniffLooksRight, type FileKind,
} from "./extract";
import { BusyError, fileGate } from "./gate";
import { notes } from "./notify";
import { supabaseAdmin } from "./supabase/admin";
import { SIZE_LIMITS, unplayableContainer } from "./uploads";

/**
 * Everything that happens to an uploaded file, in one place.
 *
 * There are two ways a file arrives now — posted straight to the app when it
 * is small, or sent to storage by the browser and read back when it is not —
 * and they must agree on every rule. Checking "is this type allowed" in two
 * places is how one of them ends up being the lenient one.
 */

export const MIME_BY_KIND = {
  pdf: "document", docx: "document", pptx: "document", xlsx: "document",
  epub: "document", rtf: "document", text: "document",
  image: "image", audio: "audio",
} as const;

export type Group = (typeof MIME_BY_KIND)[keyof typeof MIME_BY_KIND];

/** A kind the app can actually do something with — everything but "unsupported". */
export type Readable = Exclude<FileKind, "unsupported">;

/** How many pages of a scanned PDF to read. Each one is a vision call. */
export const SCAN_PAGES = 5;

/**
 * How the request's time is divided.
 *
 * The numbers matter less than the fact that there are any: before this, every
 * stage could take as long as it liked, and the only thing that ever stopped
 * an upload was the platform killing the function — which the browser receives
 * as a gateway page, not as JSON, so the front end hung on it.
 */
export const WAIT_FOR_TURN_MS = 8_000;
const PARSE_SHARE = 0.55;   // of whatever is left when parsing starts
const VISION_SHARE = 0.8;   // of what remains after that, for a scanned PDF

const READ_IMAGE_PROMPT =
  "Read this image for a student. Write out every word, number, formula and label exactly as shown, " +
  "keeping the layout order. If it is a diagram, chart or handwriting, describe what it shows after " +
  "the transcription. Do not solve anything.";

/* ------------------------------------------------------------------ */
/* What is allowed in                                                  */
/* ------------------------------------------------------------------ */

export type Verdict =
  | { ok: true; kind: Readable; group: Group; limit: number }
  | { ok: false; status: number; error: string };

/**
 * Everything that can be decided from a file's name, type and size.
 *
 * Deliberately separate from its contents, because the browser now asks
 * permission *before* sending anything: there is no point uploading twenty
 * megabytes to be told the format is wrong.
 */
export function checkFile(name: string, mime: string, size: number): Verdict {
  const kind = classify(mime || "", name || "");
  if (kind === "unsupported")
    return {
      ok: false, status: 415,
      error: "That file type is not supported. Use a PDF, Word, PowerPoint, Excel, EPUB, RTF or text file, an image, or an audio recording.",
    };

  /*
   * A video whose container cannot be opened, refused before it costs anything.
   *
   * It would otherwise upload happily, count against the daily allowance, and
   * fail later inside the transcriber with a message from somebody else's API.
   */
  if (kind === "audio") {
    const advice = unplayableContainer(name || "", mime || "");
    if (advice) return { ok: false, status: 415, error: advice };
  }

  const group = MIME_BY_KIND[kind];
  const limit = SIZE_LIMITS[group];

  if (size === 0) return { ok: false, status: 400, error: "That file is empty." };
  if (size > limit)
    return {
      ok: false, status: 413,
      error: `That file is ${(size / 1048576).toFixed(1)} MB. The limit for this type is ${Math.round(limit / 1048576)} MB.`,
    };

  return { ok: true, kind, group, limit };
}

/** Names are shown back to people and stored; newlines in them break both. */
export const safeFileName = (name: string) =>
  (name || "file").replace(/[\r\n\t]/g, " ").slice(0, 140);

/* ------------------------------------------------------------------ */
/* Saying what went wrong                                              */
/* ------------------------------------------------------------------ */

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
export function explainExtractFailure(message: string, kind: string): string {
  const m = message.toLowerCase();

  if (/password|encrypted/.test(m))
    return "That file is password protected. Remove the password and upload it again.";

  if (/dommatrix|canvas|cannot find module|is not defined|not available on this server|cannot turn pdf pages|fake worker|pdf\.worker/.test(m))
    return "This server is missing something it needs to read that file. Nothing is wrong with your file — please report it.";

  if (/invalid|corrupt|malformed|bad xref|unexpected end/.test(m))
    return `That ${kind === "pdf" ? "PDF" : "file"} appears to be damaged. Try opening and re-saving it, then upload again.`;

  if (/timeout|timed out|aborted|took longer than|stopped/.test(m))
    return "Reading that file took too long, so it was stopped. A smaller file, or one with fewer pages, usually works.";

  if (/busy|try again in a moment/.test(m))
    return "The server is reading other files right now. Please try again in a moment.";

  return "The file uploaded but could not be read. This is a problem on our side, not with your file.";
}

/* ------------------------------------------------------------------ */
/* Reading it                                                          */
/* ------------------------------------------------------------------ */

/** One rendered page, read by the vision model. */
async function readImage(dataUrl: string, page: number, of: number, deadline: number): Promise<string> {
  const res = await complete({
    model: MODEL, max_tokens: 1500, temperature: 0.2,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `${READ_IMAGE_PROMPT} This is page ${page} of ${of}.` },
        { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
      ],
    }],
  }, { deadline });
  const t = res.choices[0]?.message?.content?.trim() ?? "";
  return t ? `--- Page ${page} ---\n${t}` : "";
}

export type ReadResult = {
  text: string;
  pages: number | null;
  /** True when the pages were read by eye because there was no text layer. */
  scanned: boolean;
  /** True when some of those pages could not be read in the time available. */
  partial: boolean;
  /** Why reading a scanned PDF's pages as pictures did not happen, if it did not. */
  renderFailed: string;
};

/**
 * Turn a file's bytes into text.
 *
 * Takes a turn through the gate for each piece of real work, and spends no
 * longer than the budget allows. Throws BusyError, Expired, or whatever the
 * format's own reader threw.
 */
export async function readFile(
  bytes: Uint8Array, kind: Readable, mime: string, clock: Budget,
): Promise<ReadResult> {
  const out: ReadResult = { text: "", pages: null, scanned: false, partial: false, renderFailed: "" };

  /*
   * Reading the file waits its turn.
   *
   * Only a couple of files are read at a time on one instance, because
   * reading one is processor work: four at once do not go four times faster,
   * they go four times slower each and can all miss the deadline together.
   * Waiting here is bounded, and running out of patience is a clear answer
   * rather than a request left to die.
   */
  const parse = <T>(work: () => Promise<T>) => fileGate.run(work, Math.min(WAIT_FOR_TURN_MS, clock.left()));

  if (kind === "pdf") {
    const forParse = Math.round(clock.left() * PARSE_SHARE);
    const r = await parse(() => extractPdf(bytes, forParse));
    out.text = r.text; out.pages = r.pages ?? null;

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
    if (!out.text.trim() && !clock.expired()) {
      const forRender = Math.round(clock.left() * PARSE_SHARE);

      /*
       * A render that cannot happen is not a failed upload. Turning a page
       * into a picture needs a native graphics module that a server may not
       * have; reading text does not.
       */
      let shots: string[] = [];
      try {
        shots = await parse(() => renderPdfPages(bytes, SCAN_PAGES, forRender));
      } catch (err) {
        if (err instanceof BusyError || err instanceof Expired) throw err;
        out.renderFailed = (err as Error)?.message ?? "";
        console.error("could not render the PDF's pages:", out.renderFailed);
      }

      if (shots.length) {
        // allSettled, not all: five vision calls against a slow provider can
        // outlast the function itself, and three pages of a scanned handout
        // is worth far more to a student than an error saying the file could
        // not be read. Whatever came back is kept, in page order.
        const deadline = Date.now() + Math.round(clock.left() * VISION_SHARE);
        const read = await Promise.allSettled(
          shots.map((url, i) => readImage(url, i + 1, shots.length, deadline)),
        );
        out.text = read
          .map((r) => (r.status === "fulfilled" ? r.value : ""))
          .filter(Boolean)
          .join("\n\n");
        const missed = read.filter((r) => r.status === "rejected").length;
        if (missed) {
          console.warn(`scan: ${missed} of ${shots.length} pages could not be read`);
          out.partial = true;
        }
        out.scanned = true;
      }
    }
  }
  else if (kind === "docx") out.text = await parse(async () => extractDocx(bytes).text);
  else if (kind === "pptx") { const r = await parse(async () => extractPptx(bytes)); out.text = r.text; out.pages = r.pages ?? null; }
  else if (kind === "xlsx") { const r = await parse(async () => extractXlsx(bytes)); out.text = r.text; out.pages = r.pages ?? null; }
  else if (kind === "epub") { const r = await parse(async () => extractEpub(bytes)); out.text = r.text; out.pages = r.pages ?? null; }
  else if (kind === "rtf") out.text = await parse(async () => extractRtf(bytes).text);
  else if (kind === "text") out.text = await parse(async () => extractPlainText(bytes).text);
  else if (kind === "image") {
    const b64 = Buffer.from(bytes).toString("base64");
    const res = await complete({
      model: MODEL, max_tokens: 1500, temperature: 0.2,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: READ_IMAGE_PROMPT },
          { type: "image_url", image_url: { url: `data:${mime || "image/png"};base64,${b64}`, detail: "high" } },
        ],
      }],
    }, { deadline: Date.now() + Math.round(clock.left() * VISION_SHARE) });
    out.text = res.choices[0]?.message?.content?.trim() ?? "";
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Finishing the job                                                   */
/* ------------------------------------------------------------------ */

export type FinishArgs = {
  rowId: string;
  userId: string;
  safeName: string;
  kind: Readable;
  group: Group;
  bytes: Uint8Array;
  mime: string;
  clock: Budget;
  /** Give the daily allowance back. Called whenever the failure is ours. */
  refund: () => Promise<void>;
};

/**
 * Read the file, record the result, and answer.
 *
 * A failure here is the file's problem, not the upload's, so the row stays and
 * the person is told what went wrong.
 */
export async function finishUpload(a: FinishArgs): Promise<NextResponse> {
  const db = supabaseAdmin();

  try {
    const r = await readFile(a.bytes, a.kind, a.mime, a.clock);

    if (a.kind === "audio") {
      await db.from("uploads").update({ status: "ready", extracted_text: "" }).eq("id", a.rowId);
      return NextResponse.json({ id: a.rowId, name: a.safeName, kind: "audio", status: "ready", needsTranscript: true });
    }

    if (!r.text.trim()) {
      await db.from("uploads").update({
        status: "failed", error: r.renderFailed ? `no text; ${r.renderFailed}`.slice(0, 300) : "no text",
      }).eq("id", a.rowId);

      /*
       * Three different things end up here, and they are not the same news.
       *
       * A PDF with no text layer is a picture of a page; normally its pages
       * are read by eye instead. When that cannot be attempted at all — the
       * server is missing the graphics module — saying "could not be read" is
       * both unhelpful and wrong about whose problem it is.
       */
      const why = a.kind !== "pdf"
        ? "No readable text was found in that file."
        : r.renderFailed
          ? "That PDF is a scan — there is no text inside it to read — and this server cannot read scanned pages at the moment. Uploading the pages as images works, and this is worth reporting to us."
          : "No text could be read from that PDF, and reading the pages as images did not work either.";

      return NextResponse.json({ id: a.rowId, status: "failed", error: why }, { status: 422 });
    }

    await db.from("uploads").update({ status: "ready", extracted_text: r.text, pages: r.pages }).eq("id", a.rowId);
    notes.uploadReady(a.userId, a.safeName);

    return NextResponse.json({
      id: a.rowId, name: a.safeName, kind: a.group, status: "ready", pages: r.pages,
      chars: r.text.length, preview: r.text.slice(0, 280),
      // Worth saying: the student should know the first pages were read by
      // eye, and that a long scan was not read in full.
      ...(r.scanned ? { scanned: true, scannedPages: Math.min(r.pages ?? SCAN_PAGES, SCAN_PAGES) } : {}),
      ...(r.partial ? { partial: true } : {}),
    });
  } catch (err) {
    /*
     * Two failures here are the server's fault, not the file's, so the upload
     * is given back rather than counted.
     */
    if (err instanceof BusyError || err instanceof Expired) {
      await a.refund();
      await db.from("uploads").update({
        status: "failed", error: err instanceof BusyError ? "busy" : "out of time",
      }).eq("id", a.rowId);
      return NextResponse.json(
        {
          id: a.rowId, status: "failed", retry: true,
          error: err instanceof BusyError
            ? "The server is reading other files right now. Please try that one again in a moment."
            : "Reading that file took too long, so it was stopped. Try it on its own, or use a smaller file.",
        },
        { status: 503 },
      );
    }

    console.error("extraction failed:", err);
    // Store what actually went wrong, not the word "extract". The admin reads
    // this column when someone reports a file that will not open, and a row
    // saying "extract" has never once helped anybody.
    const raw = (err as Error)?.message ?? String(err);
    await db.from("uploads").update({ status: "failed", error: raw.slice(0, 300) }).eq("id", a.rowId);
    notes.uploadFailed(a.userId, a.safeName, explainExtractFailure(raw, a.kind));
    return NextResponse.json(
      { id: a.rowId, status: "failed", error: explainExtractFailure(raw, a.kind) },
      { status: 422 },
    );
  }
}

/** The wrapper every upload route shares: a budget, and no way to throw out of it. */
export async function withBudget(
  totalMs: number,
  work: (clock: Budget) => Promise<NextResponse>,
): Promise<NextResponse> {
  const clock = budget(totalMs);
  try {
    return await work(clock);
  } catch (err) {
    // Nothing should reach here, which is exactly why it exists: an unhandled
    // throw would otherwise be a dead request, and a dead request is a spinner
    // that never stops.
    console.error("upload failed outright:", err);
    return NextResponse.json(
      { error: err instanceof BusyError ? err.message : "The upload could not be completed. Please try again." },
      { status: err instanceof BusyError ? 503 : 500 },
    );
  } finally {
    clock.done();
  }
}
