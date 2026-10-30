/**
 * A time budget for one request.
 *
 * The platform kills a serverless function at a fixed ceiling — 60 seconds
 * here. When that happens the request does not fail politely: the function
 * disappears mid-flight and the browser is handed the platform's own gateway
 * page, which is HTML. The front end calls `res.json()` on it, that throws
 * "Unexpected token '<'", and the spinner spins for ever because nothing ever
 * resolves.
 *
 * So the rule is: the app must always answer *before* the platform would. A
 * budget is started at the top of a slow route, every slow step runs under it,
 * and whatever has been managed by the time it runs out is what gets returned.
 * Running out of time becomes an ordinary answer with an explanation in it,
 * rather than a hang.
 */

/** Thrown when a step runs past what is left. Carries a label worth reading. */
export class Expired extends Error {
  readonly label: string;
  readonly ms: number;

  constructor(label: string, ms: number) {
    super(`${label} took longer than ${Math.round(ms / 1000)}s and was stopped.`);
    this.name = "Expired";
    this.label = label;
    this.ms = ms;
  }
}

export type Budget = {
  /** Milliseconds left. Never negative. */
  left(): number;
  /** True once there is no useful time left. */
  expired(): boolean;
  /** Aborted when the budget runs out, for anything that takes a signal. */
  readonly signal: AbortSignal;
  /**
   * Run a promise under the budget.
   *
   * @param cap an optional shorter limit for this one step, so a single stage
   *   cannot eat the entire request on its own.
   */
  race<T>(work: Promise<T>, label: string, cap?: number): Promise<T>;
  /** Stop the timer. Always call this, or the process keeps a handle alive. */
  done(): void;
};

/**
 * @param totalMs how long the whole request may take. Keep this comfortably
 *   under the platform's own limit: the response still has to be written, and
 *   a budget that ends at the same moment as the function is no budget at all.
 */
export function budget(totalMs: number): Budget {
  const endsAt = Date.now() + totalMs;
  const ac = new AbortController();

  const left = () => Math.max(0, endsAt - Date.now());
  const timer = setTimeout(() => ac.abort(new Expired("the request", totalMs)), totalMs);
  // Node keeps the process alive for a pending timer; this one must not.
  (timer as unknown as { unref?: () => void }).unref?.();

  return {
    left,
    expired: () => left() <= 0,
    signal: ac.signal,
    done: () => clearTimeout(timer),

    race<T>(work: Promise<T>, label: string, cap?: number): Promise<T> {
      const ms = Math.min(cap ?? Number.MAX_SAFE_INTEGER, left());
      if (ms <= 0) return Promise.reject(new Expired(label, 0));

      return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Expired(label, ms)), ms);
        (t as unknown as { unref?: () => void }).unref?.();
        work.then(
          (v) => { clearTimeout(t); resolve(v); },
          (e) => { clearTimeout(t); reject(e); },
        );
      });
    },
  };
}

/**
 * How long this request may run in total.
 *
 * Read from the environment so a deployment on a plan with a longer ceiling
 * can use it without a code change — but defaulted low, because being wrong in
 * this direction costs a confusing hang and being wrong the other way costs a
 * partial answer.
 */
export function requestBudgetMs(fallback = 50_000): number {
  const n = Number(process.env.REQUEST_BUDGET_MS);
  return Number.isFinite(n) && n >= 5_000 ? n : fallback;
}
