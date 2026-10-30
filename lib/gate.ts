/**
 * How many heavy jobs one server instance will do at once.
 *
 * Reading a PDF is processor work, not waiting-on-the-network work. Four of
 * them at the same moment do not take turns politely: they compete for the
 * same core, each one finishes later than it would have alone, and on a small
 * instance all four can run past the request ceiling together — so uploading
 * four files at once failed where uploading them one at a time worked.
 *
 * Letting two run and making the third wait its turn is strictly better: the
 * first two finish at full speed, the third starts the moment one is done, and
 * the total is the same or shorter. What this really buys is the fourth case —
 * somebody uploading a dozen files, or a dozen people uploading at once. Then
 * the queue is full, and the honest answer is "busy, try again in a moment",
 * said immediately, instead of a request that waits until the platform kills it.
 */

type Waiter = { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class BusyError extends Error {
  constructor() {
    super("The server is reading other files right now. Please try again in a moment.");
    this.name = "BusyError";
  }
}

export type Gate = {
  /**
   * Wait for a turn, then run. Always releases, including when the work throws.
   *
   * @param maxWaitMs how long to queue before giving up. Must be well inside
   *   the caller's own budget: waiting until the request dies is the failure
   *   this exists to prevent.
   */
  run<T>(work: () => Promise<T>, maxWaitMs: number): Promise<T>;
  /** For the admin health page: what the instance is doing right now. */
  stats(): { running: number; waiting: number; limit: number };
};

function num(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

export function makeGate(limit: number, queueLimit: number): Gate {
  let running = 0;
  const queue: Waiter[] = [];

  const release = () => {
    running--;
    const next = queue.shift();
    if (next) {
      clearTimeout(next.timer);
      running++;
      next.resolve();
    }
  };

  const take = (maxWaitMs: number): Promise<void> => {
    if (running < limit) { running++; return Promise.resolve(); }
    // A queue with no ceiling is just a slower way to run out of time.
    if (queue.length >= queueLimit) return Promise.reject(new BusyError());

    return new Promise<void>((resolve, reject) => {
      const w: Waiter = {
        resolve, reject,
        timer: setTimeout(() => {
          const i = queue.indexOf(w);
          if (i >= 0) queue.splice(i, 1);
          reject(new BusyError());
        }, Math.max(0, maxWaitMs)),
      };
      (w.timer as unknown as { unref?: () => void }).unref?.();
      queue.push(w);
    });
  };

  return {
    async run<T>(work: () => Promise<T>, maxWaitMs: number): Promise<T> {
      await take(maxWaitMs);
      try { return await work(); }
      finally { release(); }
    },
    stats: () => ({ running, waiting: queue.length, limit }),
  };
}

/**
 * The gate for reading files.
 *
 * Module scope, so it is shared by every request this instance handles and
 * reset for free when the instance is recycled. Two at a time by default:
 * enough that a person uploading several files sees them finish in parallel,
 * few enough that none of them starves.
 */
export const fileGate = makeGate(
  num(process.env.FILE_CONCURRENCY, 2, 1, 16),
  num(process.env.FILE_QUEUE, 8, 0, 64),
);
