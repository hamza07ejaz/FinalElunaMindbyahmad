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
