/**
 * Everything pdfjs needs before it will open a PDF on a server.
 *
 * Both of these exist because pdfjs is a browser library being run in Node,
 * and both of them only ever broke on the deployed site — which is the worst
 * kind of bug to own, because the laptop says everything is fine.
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { installPdfShim } from "./pdf-shim.mjs";

/**
 * The drawing APIs.
 *
 * The native canvas module when it is installed, plain arithmetic when it is
 * not. Reading a PDF's text needs the arithmetic; only turning a page into a
 * picture needs the real thing.
 *
 * @returns "native" or "shim"
 */
export async function ensureDrawing(g = globalThis) {
  try {
    const canvas = await import("@napi-rs/canvas");
    for (const name of ["DOMMatrix", "Path2D", "ImageData"]) {
      if (!g[name] && canvas[name]) g[name] = canvas[name];
    }
    if (g.DOMMatrix && g.Path2D && g.ImageData) return "native";
  } catch (err) {
    console.error("@napi-rs/canvas unavailable; PDF text will still be read:", err?.message ?? err);
  }
  installPdfShim(g);
  return "shim";
}

/**
 * Point pdfjs at its own worker, by absolute path.
 *
 * On a server pdfjs does not start a real worker — it runs the worker's code
 * in the same thread. It still has to *load* that code, and it does so with
 * `import("./pdf.worker.mjs")`: a relative path, resolved against wherever
 * pdf.mjs happens to be, at the moment a PDF is opened.
 *
 * That assumption holds on a laptop and not on a deployment, where the file
 * may sit somewhere else or not have been shipped at all. The failure reads
 * `Setting up fake worker failed: "Cannot find module '/var/task/.../pdf.worker.mjs'"`,
 * which tells the student nothing and tells the developer only that it works
 * locally.
 *
 * Resolving it here, from a literal specifier, removes the guesswork: Node's
 * own resolver finds the file wherever the package actually is, and pdfjs is
 * handed the answer rather than asked to work it out.
 *
 * Returns the reason if it could not be done, or "" if all is well. Never
 * throws: if this cannot be arranged, pdfjs's own guess is still worth trying.
 */
export async function ensurePdfWorker() {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const opts = pdfjs.GlobalWorkerOptions;
    if (!opts) return "pdfjs did not expose GlobalWorkerOptions";

    // Already an absolute path? Then somebody has been here before.
    if (typeof opts.workerSrc === "string" && opts.workerSrc.startsWith("file:")) return "";

    const require = createRequire(import.meta.url);
    const file = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    opts.workerSrc = pathToFileURL(file).href;
    return "";
  } catch (err) {
    const why = err?.message ?? String(err);
    console.error("could not pin pdfjs's worker; falling back to its own lookup:", why);
    return why;
  }
}

/**
 * Turn whatever pdfjs says about a missing worker into something true.
 *
 * The student's file is fine. This is a packaging problem on the server, and
 * the message should say so rather than quoting a path in a temp directory.
 */
export function explainWorkerFailure(message) {
  return /fake worker|pdf\.worker/i.test(String(message ?? ""))
    ? "This server is missing a file it needs to read PDFs. Nothing is wrong with your file — please report it."
    : "";
}
