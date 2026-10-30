import { Worker } from "node:worker_threads";

/**
 * Reading a PDF, with a timeout that actually stops the work.
 *
 * The parsing itself lives in `pdf-worker.mjs` and the reasons are there. This
 * side is about what happens when it goes wrong: a worker that overruns is
 * terminated rather than abandoned, and a worker that cannot be started at all
 * falls back to parsing in this process, because a server that reads PDFs
 * slowly is better than one that cannot read them.
 */

export type PdfText = { text: string; pages: number | null };

/** Beyond this a PDF is not coursework, it is a stress test. */
const HARD_CAP_MS = 120_000;

export class PdfTimeout extends Error {
  constructor(ms: number) {
    super(`Reading the PDF took longer than ${Math.round(ms / 1000)}s and was stopped.`);
    this.name = "PdfTimeout";
  }
}

/**
 * Where the worker file is at runtime.
 *
 * `import.meta.url` is what the bundler follows to decide the file has to be
 * shipped, so this is deliberately a plain relative URL and not built from a
 * variable — a computed path is invisible to it, and the first upload on the
 * deployed site would be the thing that discovered the file was missing.
 */
const workerUrl = new URL("./pdf-worker.mjs", import.meta.url);

type Job = { job: "text"; bytes: Uint8Array } | { job: "render"; bytes: Uint8Array; maxPages: number; width: number };

function inWorker<T>(data: Job, timeoutMs: number): Promise<T> {
  /*
   * The caller's number is honoured as given.
   *
   * It was briefly raised to a one-second floor, on the grounds that no useful
   * work finishes sooner — which quietly meant a request with 200ms left spent
   * a second it did not have. If there is no time, the answer is "no time",
   * now, while there is still room to say so.
   */
  const ms = Math.min(Math.max(0, timeoutMs), HARD_CAP_MS);
  if (ms <= 0) return Promise.reject(new PdfTimeout(0));

  return new Promise<T>((resolve, reject) => {
    /*
     * The worker is given its own copy, and that copy is what gets transferred.
     *
     * Transferring the caller's own bytes looked like a free optimisation and
     * was a bug: transferring detaches the buffer, so the array the caller
     * still holds becomes unusable. The route reads a PDF's text and then, if
     * there is none, renders its pages from the same bytes — so every scanned
     * PDF, the exact case that path exists for, failed on the second call with
     * "Cannot perform Construct on a detached ArrayBuffer".
     *
     * One copy, handed over. Structured clone would have copied it anyway.
     */
    const owned = new Uint8Array(data.bytes);
    let worker: Worker;
    try {
      worker = new Worker(workerUrl, {
        workerData: { ...data, bytes: owned },
        transferList: [owned.buffer],
        resourceLimits: {
          // A PDF that tries to allocate its way out of trouble hits this and
          // the worker dies, rather than the whole instance being killed.
          maxOldGenerationSizeMb: Number(process.env.PDF_WORKER_MB) || 512,
        },
      });
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new PdfTimeout(ms))), ms);
    (timer as unknown as { unref?: () => void }).unref?.();

    worker.on("message", (m: { ok: boolean; value?: T; message?: string; name?: string }) => {
      finish(() => {
        if (m.ok) return resolve(m.value as T);
        const err = new Error(m.message || "The PDF could not be read.");
        err.name = m.name || "Error";
        reject(err);
      });
    });

    worker.on("error", (err) => finish(() => reject(err)));
    worker.on("exit", (code) => {
      // Only reached when the worker died without answering: an out-of-memory
      // kill, or a terminate that beat the message.
      if (code !== 0) finish(() => reject(new Error(`The PDF reader stopped unexpectedly (code ${code}).`)));
      else finish(() => reject(new Error("The PDF reader finished without reading anything.")));
    });
  });
}

/**
 * Whether starting a worker is even possible here.
 *
 * Decided once, by trying. If the bundle did not ship the worker file, every
 * subsequent PDF skips the attempt instead of paying for a failed spawn each
 * time — and the fallback below still reads the file.
 */
let workersUsable: boolean | null = null;

async function viaWorker<T>(data: Job, timeoutMs: number): Promise<T | null> {
  if (workersUsable === false) return null;
  try {
    const out = await inWorker<T>(data, timeoutMs);
    workersUsable = true;
    return out;
  } catch (err) {
    const m = (err as Error)?.message ?? "";
    // A timeout or a damaged file is a real answer about this PDF, so it is
    // passed on. Only a worker that could not be started at all is a reason to
    // stop using workers.
    const cannotStart = /cannot find module|no such file|not supported|worker_threads/i.test(m);
    if (!cannotStart) throw err;
    console.error("PDF worker unavailable, reading in-process instead:", m);
    workersUsable = false;
    return null;
  }
}

/* ---------------- the in-process fallback ---------------- */

let polyfilled = false;

/**
 * The same arrangement as the worker, for the in-process fallback: the real
 * canvas module when it is installed, plain arithmetic when it is not, so a
 * missing native binary costs page rendering rather than PDFs altogether.
 */
async function ensureGlobals(): Promise<"native" | "shim"> {
  const g = globalThis as Record<string, unknown>;
  if (polyfilled) return g.__pdfDrawing as "native" | "shim";

  let how: "native" | "shim" = "shim";
  try {
    const canvas = (await import("@napi-rs/canvas")) as unknown as Record<string, unknown>;
    for (const name of ["DOMMatrix", "Path2D", "ImageData"]) {
      if (!g[name] && canvas[name]) g[name] = canvas[name];
    }
    if (g.DOMMatrix && g.Path2D && g.ImageData) how = "native";
  } catch (err) {
    console.error("@napi-rs/canvas unavailable; PDF text will still be read:", (err as Error)?.message);
  }

  if (how === "shim") {
    const { installPdfShim } = await import("./pdf-shim.mjs");
    installPdfShim(g as unknown as typeof globalThis);
  }

  g.__pdfDrawing = how;
  polyfilled = true;
  return how;
}

async function parser(bytes: Uint8Array, needsDrawing = false) {
  const how = await ensureGlobals();
  if (needsDrawing && how === "shim") {
    throw new Error(
      "This server cannot turn PDF pages into images: the @napi-rs/canvas module is not installed. " +
      "Reading PDFs that contain text still works.",
    );
  }
  const { PDFParse } = await import("pdf-parse");
  return new PDFParse({ data: new Uint8Array(bytes) });
}

/* ---------------- what the app calls ---------------- */

export async function pdfText(bytes: Uint8Array, timeoutMs: number): Promise<PdfText> {
  const out = await viaWorker<PdfText>({ job: "text", bytes }, timeoutMs);
  if (out) return { text: out.text ?? "", pages: out.pages ?? null };

  const p = await parser(bytes);
  try {
    const r = await p.getText();
    return { text: r.text ?? "", pages: r.total ?? null };
  } finally {
    await p.destroy().catch(() => {});
  }
}

/**
 * The first pages as images, for a PDF with no text in it — a scan, or a photo
 * of a textbook saved as a PDF.
 */
export async function pdfPageImages(
  bytes: Uint8Array,
  maxPages: number,
  timeoutMs: number,
  width = 1400,
): Promise<string[]> {
  const out = await viaWorker<{ pages: string[] }>({ job: "render", bytes, maxPages, width }, timeoutMs);
  if (out) return out.pages ?? [];

  const p = await parser(bytes, true);
  try {
    const shot = await p.getScreenshot({
      first: 1, last: maxPages, desiredWidth: width, imageDataUrl: true, imageBuffer: false,
    });
    return (shot.pages ?? []).map((x: { dataUrl: string }) => x.dataUrl).filter(Boolean);
  } finally {
    await p.destroy().catch(() => {});
  }
}
