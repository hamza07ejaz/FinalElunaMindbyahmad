/**
 * PDF reading, off the main thread.
 *
 * Two problems are being solved, and both of them are about the same fact:
 * parsing a PDF is processor work that runs inside this process.
 *
 * The first is that it cannot be cancelled. A promise race against a timer
 * does not stop a loop that is already running — the timer fires, the caller
 * gives up, and the loop carries on burning the processor for as long as it
 * likes. A worker can be terminated outright, so a timeout here actually stops
 * the work.
 *
 * The second is that while it runs, nothing else in the process does. Node has
 * one thread for JavaScript: a PDF being parsed on it means every other
 * request on the same instance is frozen until it finishes — somebody else's
 * chat message, somebody's login, the health check. That is what made several
 * uploads at once look like the whole site had hung.
 *
 * Plain .mjs on purpose: a worker is started by file path at runtime, so it
 * must be a file the bundler leaves alone and the platform ships as it is.
 */
import { parentPort, workerData } from "node:worker_threads";
import { ensureDrawing, ensurePdfWorker } from "./pdf-setup.mjs";

async function run() {
  const { job, bytes, maxPages, width } = workerData;
  const drawing = await ensureDrawing();
  // Pin pdfjs's own worker file before the first PDF is opened, not after.
  await ensurePdfWorker();

  /*
   * Rendering a page genuinely needs the real thing — the shim does not draw.
   * Said plainly here, before any work, so the answer is about what is missing
   * on the server rather than an error from inside a graphics library.
   */
  if (job === "render" && drawing === "shim") {
    throw new Error(
      "This server cannot turn PDF pages into images: the @napi-rs/canvas module is not installed. " +
      "Reading PDFs that contain text still works.",
    );
  }

  const { PDFParse } = await import("pdf-parse");
  // The parser hands its buffer to pdfjs, which detaches it. The copy keeps
  // the data usable if this worker is asked for a second thing.
  const parser = new PDFParse({ data: new Uint8Array(bytes) });

  try {
    if (job === "text") {
      const r = await parser.getText();
      return { text: r.text ?? "", pages: r.total ?? null };
    }

    const shot = await parser.getScreenshot({
      first: 1,
      last: maxPages,
      desiredWidth: width,
      imageDataUrl: true,
      imageBuffer: false,
    });
    return { pages: (shot.pages ?? []).map((p) => p.dataUrl).filter(Boolean) };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

run().then(
  (value) => parentPort?.postMessage({ ok: true, value }),
  // An Error does not survive the structured clone intact, so the parts worth
  // keeping are sent by hand. The message is what decides which explanation
  // the student is given.
  (err) => parentPort?.postMessage({ ok: false, message: err?.message ?? String(err), name: err?.name ?? "Error" }),
);
