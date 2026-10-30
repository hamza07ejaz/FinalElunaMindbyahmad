import { unzipSync, strFromU8 } from "fflate";

/**
 * Pull readable text out of an uploaded file.
 * Everything here runs on the server, on bytes a stranger supplied, so each
 * path is wrapped and the output is capped before it ever reaches a prompt.
 */

export const MAX_EXTRACTED_CHARS = 60_000;

export type Extracted = { text: string; pages?: number };

const tidy = (s: string) =>
  s.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_EXTRACTED_CHARS);

/**
 * Reading PDFs now lives in ./pdf.ts, in a worker.
 *
 * It used to run here, in this process, with no way to stop it. That was the
 * cause of two separate complaints that looked unrelated: a PDF that took too
 * long killed the whole request with no error the browser could read, and
 * several uploads at once froze each other, because parsing is processor work
 * and this process has one thread for it.
 *
 * These two keep their old names so every caller reads the same, but both now
 * take the time they are allowed to spend. There is no sensible default for
 * that — it belongs to the request, which knows how much of its own budget is
 * left — so it is required.
 */
export { pdfText, pdfPageImages, PdfTimeout } from "./pdf";
import { pdfPageImages, pdfText } from "./pdf";

export async function extractPdf(bytes: Uint8Array, timeoutMs: number): Promise<Extracted> {
  const r = await pdfText(bytes, timeoutMs);
  return { text: tidy(r.text), pages: r.pages ?? undefined };
}

/**
 * Render the first pages of a PDF as images.
 *
 * For the PDFs that have no text in them at all — a phone photo of a textbook
 * saved as a PDF, a scanned handout, the lecture notes someone photocopied in
 * 1998. Those used to be a dead end: the text layer is empty, so the upload
 * failed and the student was told to "upload it as an image instead", which
 * means opening the PDF and screenshotting every page by hand.
 *
 * Capped at a few pages on purpose. Each one becomes a vision call, and a
 * 300-page scan would be both a long wait and a large bill.
 */
export function renderPdfPages(bytes: Uint8Array, maxPages: number, timeoutMs: number): Promise<string[]> {
  return pdfPageImages(bytes, maxPages, timeoutMs);
}

/**
 * DOCX is a zip holding word/document.xml. Reading that one entry avoids a
 * heavyweight converter, and we only need the words anyway.
 */
export function extractDocx(bytes: Uint8Array): Extracted {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("This does not look like a Word document.");

  const text = strFromU8(xml)
    .replace(/<w:p\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

  return { text: tidy(text) };
}

export function extractPlainText(bytes: Uint8Array): Extracted {
  return { text: tidy(new TextDecoder("utf-8", { fatal: false }).decode(bytes)) };
}

/* ------------------------------------------------------------------ */
/* The other things students actually have                             */
/* ------------------------------------------------------------------ */

/** Decode the XML entities that appear in Office documents. */
const unent = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
   .replace(/&amp;/g, "&");   // last, or the others would be double-decoded

/**
 * How much a zip is allowed to become once unpacked.
 *
 * PowerPoint, Excel and EPUB files are all zips, which means a 2 MB upload can
 * legally expand to several gigabytes — the zip bomb. Nothing about the upload
 * looks wrong: it is the right size, the right type, and the right magic bytes.
 * The damage is done inside the unzip call, on the server, to every other
 * person using it at that moment.
 *
 * fflate's filter runs before an entry is decompressed and sees its declared
 * size, so the running total is checked there and a hostile archive is refused
 * without ever being expanded.
 */
const MAX_UNZIPPED = 80 * 1024 * 1024;
const MAX_ENTRIES = 2000;

/** Read the entries of a zip whose names pass a test, in name order. */
function zipEntries(bytes: Uint8Array, want: (name: string) => boolean): [string, Uint8Array][] {
  let total = 0;
  let seen = 0;

  const files = unzipSync(bytes, {
    filter: (f) => {
      if (++seen > MAX_ENTRIES) throw new Error("That file has too many parts to be read safely.");
      if (!want(f.name)) return false;
      total += f.originalSize ?? 0;
      if (total > MAX_UNZIPPED) throw new Error("That file expands to more than this server will read.");
      return true;
    },
  });

  return Object.entries(files).sort(([a], [b]) =>
    // slide10 must come after slide9, which a plain string sort gets wrong.
    a.localeCompare(b, "en", { numeric: true }),
  );
}

/**
 * PowerPoint. Every run of text on a slide sits in an <a:t> element; the notes
 * live in a parallel notesSlides folder. Slides are kept in order and separated,
 * because "slide 4 said X" is a thing students ask about.
 */
export function extractPptx(bytes: Uint8Array): Extracted {
  const slides = zipEntries(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  if (!slides.length) throw new Error("No slides found — this may not be a PowerPoint file.");

  const notes = new Map<string, string>();
  for (const [name, data] of zipEntries(bytes, (n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))) {
    const n = name.match(/notesSlide(\d+)\.xml$/)?.[1] ?? "";
    notes.set(n, runsOf(strFromU8(data)));
  }

  const parts: string[] = [];
  for (const [name, data] of slides) {
    const n = name.match(/slide(\d+)\.xml$/)?.[1] ?? "";
    const body = runsOf(strFromU8(data));
    if (!body.trim()) continue;
    parts.push(`--- Slide ${n} ---\n${body}`);
    const note = notes.get(n);
    if (note?.trim()) parts.push(`Speaker notes: ${note}`);
  }

  return { text: tidy(parts.join("\n\n")), pages: slides.length };
}

/** The text runs of an Office XML part, with paragraph breaks preserved. */
function runsOf(xml: string): string {
  return unent(
    xml
      .replace(/<a:br\s*\/>/g, "\n")
      .replace(/<\/a:p>/g, "\n")
      .replace(/<a:t[^>]*>/g, "")
      .replace(/<\/a:t>/g, " ")
      .replace(/<[^>]+>/g, ""),
  ).replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n");
}

/**
 * Excel. Cell values are indexes into a shared string table, so the table has to
 * be read first or every cell comes out as a number. Rows are emitted
 * tab-separated, which is the shape a model reads most reliably.
 */
export function extractXlsx(bytes: Uint8Array): Extracted {
  const shared: string[] = [];
  const sharedEntry = zipEntries(bytes, (n) => n === "xl/sharedStrings.xml")[0];
  if (sharedEntry) {
    const xml = strFromU8(sharedEntry[1]);
    for (const si of xml.split("<si>").slice(1)) {
      // A cell can be several runs with formatting; join them back into one.
      const text = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("");
      shared.push(unent(text));
    }
  }

  const sheets = zipEntries(bytes, (n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheets.length) throw new Error("No sheets found — this may not be a spreadsheet.");

  const parts: string[] = [];
  for (const [name, data] of sheets) {
    const xml = strFromU8(data);
    const rows: string[] = [];
    for (const row of xml.split("<row").slice(1)) {
      const cells: string[] = [];
      for (const m of row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = m[1];
        const inner = m[2];
        const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        if (type === "s") cells.push(shared[Number(v)] ?? "");
        else if (type === "inlineStr") cells.push(unent(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? ""));
        else cells.push(unent(v));
      }
      const line = cells.join("\t").trim();
      if (line) rows.push(line);
    }
    if (rows.length) {
      const n = name.match(/sheet(\d+)\.xml$/)?.[1] ?? "";
      parts.push(`--- Sheet ${n} ---\n${rows.join("\n")}`);
    }
  }

  if (!parts.length) throw new Error("That spreadsheet has no readable cells.");
  return { text: tidy(parts.join("\n\n")), pages: sheets.length };
}

/**
 * EPUB. A zip of XHTML chapters; the spine order lives in an OPF file, but
 * sorting the content files by name is right often enough and never fails the
 * way a missing or malformed OPF does.
 */
export function extractEpub(bytes: Uint8Array): Extracted {
  const docs = zipEntries(bytes, (n) => /\.(x?html|htm)$/i.test(n) && !/nav\.xhtml$|toc\./i.test(n));
  if (!docs.length) throw new Error("No chapters found — this may not be an EPUB.");

  const parts: string[] = [];
  for (const [, data] of docs) {
    const html = strFromU8(data);
    const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
    const text = unent(
      body
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    ).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text) parts.push(text);
  }

  if (!parts.length) throw new Error("That EPUB has no readable text.");
  return { text: tidy(parts.join("\n\n")), pages: docs.length };
}

/**
 * RTF. Not a zip and not XML: a stream of braces and backslash control words.
 * Only the escapes a word processor actually emits are handled — the aim is the
 * words, not a faithful rendering.
 */
/**
 * Remove whole RTF groups by name, braces balanced.
 *
 * "{\fonttbl{\f0 Times;}{\f1 Arial;}}" is one group containing two more. A
 * non-greedy regex ends at the first "}" and leaves the rest of the table in
 * the document, where the control words get stripped and the font names arrive
 * on screen looking like text the student wrote.
 */
/**
 * One byte of Windows-1252 as a character.
 *
 * Only 0x80–0x9F differs from latin-1, and it is precisely the range Word
 * writes for the punctuation people type: curly quotes, en and em dashes,
 * ellipses. Treated as latin-1 they become unprintable control codes and
 * disappear, taking the apostrophe out of every possessive in the document.
 */
const CP1252_HIGH = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F" +
                    "\u0090‘’“”•–—˜™š›œ\u009DžŸ";
const cp1252 = (b: number) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b));

function dropGroups(s: string, names: string[]): string {
  const start = new RegExp(`\\{(?:\\\\\\*)?\\\\(?:${names.join("|")})\\b`, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = start.exec(s))) {
    if (m.index < last) continue;                 // inside a group already removed
    out += s.slice(last, m.index);

    let depth = 0;
    let i = m.index;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === "\\") { i++; continue; }          // an escaped brace is not a brace
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    last = i;
    start.lastIndex = i;
  }

  return out + s.slice(last);
}

export function extractRtf(bytes: Uint8Array): Extracted {
  let s = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!s.startsWith("{\\rtf")) throw new Error("That does not look like an RTF file.");

  // Whole groups that hold metadata rather than content. These nest — a font
  // table is a group of groups — so they are matched by counting braces rather
  // than by a non-greedy regex, which stops at the first inner "}" and leaves
  // half a font table behind to be printed as if it were prose.
  s = dropGroups(s, ["fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "themedata", "generator"]);
  s = s.replace(/\\par[d]?\b/g, "\n");
  s = s.replace(/\\tab\b/g, "\t");
  s = s.replace(/\\line\b/g, "\n");

  // A literal brace or backslash is escaped in the source. Stash them now:
  // the brace-stripping step below cannot tell "\{" from a real group opener,
  // and used to delete the brace while keeping the backslash — exactly backwards.
  s = s.replace(/\\\\/g, "").replace(/\\\{/g, "").replace(/\\\}/g, "");

  // \'92 is a byte in the document's code page, which for anything produced by
  // Word is Windows-1252. Decoding it as latin-1 turns the characters people
  // actually type — curly quotes, dashes, ellipses — into control codes that
  // then get stripped, quietly eating the apostrophe out of "Newton's".
  s = s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => cp1252(parseInt(h, 16)));
  s = s.replace(/\\u(-?\d+)\s?\??/g, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)));
  s = s.replace(/\\[a-z]+-?\d*\s?/gi, "");   // any remaining control word
  s = s.replace(/[{}]/g, "");
  s = s.replace(//g, "\\").replace(//g, "{").replace(//g, "}");

  const text = tidy(s);
  if (!text) throw new Error("That RTF file has no readable text.");
  return { text };
}

/** Which handler a file needs, based on its real type rather than its name. */
export type FileKind =
  | "pdf" | "docx" | "pptx" | "xlsx" | "epub" | "rtf"
  | "text" | "image" | "audio" | "unsupported";

export function classify(mime: string, name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mime.includes("presentationml") || ext === "pptx") return "pptx";
  if (mime.includes("spreadsheetml") || ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (mime === "application/epub+zip" || ext === "epub") return "epub";
  // RTF before the text check: its mime is text/rtf but it is not plain text,
  // and decoding it as such fills the page with control words.
  if (mime.includes("rtf") || ext === "rtf") return "rtf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "heic", "bmp"].includes(ext)) return "image";
  if (mime.startsWith("audio/") || mime.startsWith("video/") || ["mp3", "m4a", "wav", "webm", "ogg", "mp4", "mpga", "aac", "flac"].includes(ext)) return "audio";
  if (mime.startsWith("text/") || ["txt", "md", "markdown", "csv", "tsv", "json", "log", "srt", "vtt"].includes(ext)) return "text";
  return "unsupported";
}

/** Magic-byte check, so a renamed .exe cannot pose as a PDF. */
export function sniffLooksRight(kind: FileKind, bytes: Uint8Array): boolean {
  const head = Array.from(bytes.slice(0, 8));
  const is = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  const zip = () => is(0x50, 0x4b, 0x03, 0x04) || is(0x50, 0x4b, 0x05, 0x06);
  switch (kind) {
    case "pdf":  return is(0x25, 0x50, 0x44, 0x46);                   // %PDF
    case "docx":
    case "pptx":
    case "xlsx":
    case "epub": return zip();                                        // all OOXML/epub are zips
    case "rtf":  return is(0x7b, 0x5c, 0x72, 0x74, 0x66);             // {\rtf
    case "image":
      return is(0x89, 0x50, 0x4e, 0x47)                               // png
        || is(0xff, 0xd8, 0xff)                                       // jpeg
        || is(0x47, 0x49, 0x46, 0x38)                                 // gif
        || (is(0x52, 0x49, 0x46, 0x46) && bytes.length > 12);         // webp (RIFF)
    case "text":
    case "audio":
      return true;  // these have no single reliable signature
    default:
      return false;
  }
}
