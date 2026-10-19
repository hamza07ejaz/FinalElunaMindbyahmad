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

export async function extractPdf(bytes: Uint8Array): Promise<Extracted> {
  const { PDFParse } = await import("pdf-parse");
  // The parser hands its buffer to a worker, which detaches it. Give it a copy so
  // the caller's bytes stay usable afterwards.
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const r = await parser.getText();
    return { text: tidy(r.text ?? ""), pages: r.total ?? undefined };
  } finally {
    await parser.destroy().catch(() => {});
  }
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

/** Which handler a file needs, based on its real type rather than its name. */
export type FileKind = "pdf" | "docx" | "text" | "image" | "audio" | "unsupported";

export function classify(mime: string, name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.includes("wordprocessingml") || ext === "docx") return "docx";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  if (mime.startsWith("audio/") || mime.startsWith("video/") || ["mp3", "m4a", "wav", "webm", "ogg", "mp4", "mpga"].includes(ext)) return "audio";
  if (mime.startsWith("text/") || ["txt", "md", "csv", "rtf"].includes(ext)) return "text";
  return "unsupported";
}

/** Magic-byte check, so a renamed .exe cannot pose as a PDF. */
export function sniffLooksRight(kind: FileKind, bytes: Uint8Array): boolean {
  const head = Array.from(bytes.slice(0, 8));
  const is = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  switch (kind) {
    case "pdf":  return is(0x25, 0x50, 0x44, 0x46);                   // %PDF
    case "docx": return is(0x50, 0x4b, 0x03, 0x04) || is(0x50, 0x4b, 0x05, 0x06); // zip
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
