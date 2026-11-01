/**
 * Browser-side deadlines for a streamed answer.
 *
 * Lives in its own file because the numbers have to agree with the server's and
 * because a timeout is the one piece of this that is worth testing on its own.
 */

/**
 * How long to wait for the next piece of an answer before giving up.
 *
 * The server stops streaming at 50 seconds and the platform kills the function
 * at 60, so anything still silent after 30 is never arriving. Waiting longer is
 * what left a chat spinning with no answer and no error.
 */
export const STALL_MS = 30_000;

/**
 * What the server appends when it has no answer at all. Shared so the two sides
 * cannot drift: a marker the browser stops recognising would be printed into
 * the chat bubble as if the AI had said it.
 */
export const ERROR_MARKER = "\n[[ERROR]]";

/**
 * The most of one answer a browser tab will hold.
 *
 * A streamed answer used to grow without limit: every piece that arrived was
 * added to a string, and the whole string was re-rendered as formatted text on
 * each one. A model that repeats itself — which they do, and which a new model
 * on an unfamiliar prompt does more often — produces hundreds of thousands of
 * words, and the tab dies with "Aw, Snap! Out of Memory" before anybody can
 * press stop.
 *
 * 120,000 characters is roughly a 200-page essay. No real answer comes close,
 * and anything past it is a model that has lost its way: better to keep what
 * was said, say it was cut off, and leave the browser alive.
 */
export const MAX_ANSWER_CHARS = 120_000;

/**
 * How often the growing answer is painted, in milliseconds.
 *
 * Pieces arrive many times a second, and each repaint re-formats the entire
 * answer so far — so the work grows with the square of the length. Painting at
 * most twenty times a second looks identical to a reader and does a fraction
 * of the work.
 */
export const PAINT_EVERY_MS = 50;

/**
 * Trim an answer to what a browser can safely hold, and say so if it was cut.
 *
 * Used on both paths the answer can arrive by. The streamed path had the
 * ceiling and the non-streamed one did not, which is a distinction no reader
 * can see and no model respects.
 */
export function capAnswer(text: string): string {
  if (text.length <= MAX_ANSWER_CHARS) return text;
  return `${text.slice(0, MAX_ANSWER_CHARS)}${CUT_OFF_NOTE}`;
}

/** Said to the reader when an answer is stopped for running too long. */
export const CUT_OFF_NOTE =
  "\n\n---\n*The answer was cut off — it ran much longer than an answer should. Try asking for something more specific.*";

/** Thrown when a deadline passes. Distinct from an abort, which the user did. */
export class Stalled extends Error {
  constructor(message = "stalled") { super(message); this.name = "Stalled"; }
}

/**
 * The promise, or a `Stalled` rejection — whichever happens first.
 *
 * The underlying promise is not cancelled: the caller aborts the request itself,
 * which is the only thing that actually stops the work.
 */
export function readWithin<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const clear = () => clearTimeout(timer);
  return Promise.race([
    p.then((v) => { clear(); return v; }, (e) => { clear(); throw e; }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Stalled()), ms); }),
  ]);
}
