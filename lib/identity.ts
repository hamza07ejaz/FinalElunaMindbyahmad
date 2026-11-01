import { createHash } from "node:crypto";

/**
 * Who a token belongs to, remembered for a few seconds.
 *
 * Every request the app serves begins by asking Supabase "whose token is
 * this?" and then reading that person's row. Two round trips, one after the
 * other, before a single useful thing happens — and in production the
 * database is in another region, so each one is tens of milliseconds rather
 * than the fraction of a millisecond it costs on a laptop. A student typing
 * in the chat makes several requests a minute and pays that twice every time.
 *
 * Only the *identity* is cached: which account a token belongs to, which is
 * fixed for the life of the token. Everything that can change — the plan, the
 * role, whether the account has been suspended — is still read fresh on every
 * single request, so blocking somebody or changing their plan still takes
 * effect immediately.
 *
 * The one thing this gives up: a token revoked by signing out keeps naming its
 * owner for up to the lifetime below. Suspending an account is unaffected,
 * because that is read from the row every time. A minute is the default
 * because it is short enough that nobody notices and long enough to remove
 * most of the round trips.
 */

type Known = { userId: string; email?: string; at: number };

const cache = new Map<string, Known>();

/** Kept small: this runs in a serverless instance, not a cache server. */
const MAX_ENTRIES = 5_000;

function ttl(): number {
  const n = Number(process.env.AUTH_CACHE_MS);
  // Zero switches it off entirely, which is a reasonable thing to want.
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

/**
 * The key is a hash, not the token.
 *
 * A token is a credential. Holding thousands of them in a map, in a process
 * that may later log or dump its own memory, is a risk with no upside: a hash
 * identifies the token just as well and cannot be used to sign in.
 */
const keyFor = (token: string) => createHash("sha256").update(token).digest("base64");

export function rememberedUser(token: string): { userId: string; email?: string } | null {
  const life = ttl();
  if (!life || !token) return null;

  const hit = cache.get(keyFor(token));
  if (!hit) return null;
  if (Date.now() - hit.at > life) { cache.delete(keyFor(token)); return null; }
  return { userId: hit.userId, email: hit.email };
}

export function rememberUser(token: string, userId: string, email?: string) {
  if (!ttl() || !token || !userId) return;

  // Oldest out first. A serverless instance is short-lived, so this is a
  // safety valve rather than a real eviction policy.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(keyFor(token), { userId, email, at: Date.now() });
}

/** For signing out, and for the tests. */
export function forgetUser(token: string) { cache.delete(keyFor(token)); }
export function forgetEveryone() { cache.clear(); }
export function identityCacheSize() { return cache.size; }
