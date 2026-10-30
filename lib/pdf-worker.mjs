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

/**
 * pdfjs draws with browser drawing APIs that Node does not have. The native
 * canvas module provides them; without it the first page render throws
 * "DOMMatrix is not defined", which is a confusing way to say "a library is
 * missing on the server".
 */
async function ensureGlobals() {
  const g = globalThis;
  if (g.DOMMatrix && g.Path2D && g.ImageData) return;
  const canvas = await import("@napi-rs/canvas");
  for (const name of ["DOMMatrix", "Path2D", "ImageData"]) {
    if (!g[name] && canvas[name]) g[name] = canvas[name];
  }
}

async function run() {
  const { job, bytes, maxPages, width } = workerData;
  await ensureGlobals();

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
