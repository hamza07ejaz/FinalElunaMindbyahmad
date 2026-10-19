import { supabaseAdmin } from "./supabase/admin";

/**
 * Error recording.
 *
 * The point of this file is that a crash in production leaves a trace an admin
 * can find, instead of a line in a Netlify log nobody reads.
 *
 * Two rules it must never break:
 *   1. Recording an error can never throw. A failure here would turn a handled
 *      500 into an unhandled one, which is strictly worse than losing the record.
 *   2. Nothing secret goes in. Messages and stacks are scrubbed for keys and
 *      tokens before they are stored, because the admin panel displays them.
 */

export type ErrorLevel = "warn" | "error" | "fatal";

export type ErrorContext = {
  level?: ErrorLevel;
  /** Null when the path could not be parsed; the record is still worth keeping. */
  route?: string | null;
  method?: string;
  status?: number;
  userId?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  /** Anything that helps reproduce it. Keep it small and free of user content. */
  extra?: Record<string, unknown>;
};

/** Values that must never reach the error table, even inside a stack trace. */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/sb_secret_[A-Za-z0-9_-]+/g, "sb_secret_[redacted]"],
  [/sb_publishable_[A-Za-z0-9_-]+/g, "sb_publishable_[redacted]"],
  [/sk_(live|test)_[A-Za-z0-9]+/g, "sk_[redacted]"],
  [/whsec_[A-Za-z0-9]+/g, "whsec_[redacted]"],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt redacted]"],
  [/\b(?:AIza|sk-)[A-Za-z0-9_-]{16,}/g, "[api key redacted]"],
  // "Bearer <token>" and friends: the scheme word sits between the field name
  // and the secret, so the key=value pattern below never reaches it.
  [/\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [/(authorization|api[-_]?key|password|token|secret)["'\s:=]+[^\s"',}]{8,}/gi, "$1=[redacted]"],
];

export function scrub(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * The grouping key. Two crashes belong together when they are the same bug, so
 * the parts of a message that change per request — ids, numbers, quoted values,
 * urls — are replaced before hashing. Without this, one broken route produces a
 * hundred "distinct" problems and the list becomes useless.
 */
export function fingerprint(name: string, message: string, route?: string | null): string {
  const normalised = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
    .replace(/https?:\/\/[^\s"')]+/g, "<url>")
    // No trailing \b: a number glued to a unit ("3000ms", "503kb") must
    // normalise too, or the same timeout at two durations looks like two bugs.
    .replace(/\b\d[\d.,]*/g, "<n>")
    .replace(/"[^"]*"|'[^']*'/g, "<v>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return hash(`${name}|${normalised}|${route ?? ""}`);
}

/** Small, stable, non-cryptographic hash — this is a grouping key, not a secret. */
function hash(input: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16) + (h1 >>> 0).toString(16)).padStart(16, "0");
}

function describe(err: unknown): { name: string; message: string; stack: string | null } {
  if (err instanceof Error)
    return { name: err.name || "Error", message: err.message || String(err), stack: err.stack ?? null };
  if (typeof err === "string") return { name: "Error", message: err, stack: null };
  try {
    return { name: "Error", message: JSON.stringify(err)?.slice(0, 500) ?? "Unknown error", stack: null };
  } catch {
    return { name: "Error", message: "Unserialisable error", stack: null };
  }
}

/**
 * Record one error. Safe to call from any catch block, and safe to not await:
 * it resolves to the fingerprint, or null if recording itself failed.
 */
export async function captureError(err: unknown, ctx: ErrorContext = {}): Promise<string | null> {
  try {
    const { name, message, stack } = describe(err);
    const cleanMessage = scrub(message);
    const fp = fingerprint(name, cleanMessage, ctx.route);

    const { error } = await supabaseAdmin().rpc("record_error", {
      p_fingerprint: fp,
      p_level: ctx.level ?? "error",
      p_source: "server",
      p_name: name,
      p_message: cleanMessage,
      p_route: ctx.route ?? null,
      p_method: ctx.method ?? null,
      p_status: ctx.status ?? null,
      p_stack: stack ? scrub(stack) : null,
      p_user: ctx.userId ?? null,
      p_email: ctx.userEmail ?? null,
      p_agent: ctx.userAgent ?? null,
      p_context: ctx.extra ? (JSON.parse(scrub(JSON.stringify(ctx.extra))) as Record<string, unknown>) : null,
      p_sample_secs: 20,
    });

    if (error) {
      // Migration 008 may not have been run yet. Say so once, in the log, and
      // carry on: monitoring must never be the thing that breaks the app.
      console.error("record_error failed:", error.message);
      return null;
    }
    return fp;
  } catch (recordingFailure) {
    console.error("captureError failed:", recordingFailure);
    return null;
  }
}

/**
 * The shape used by API routes: log for the live tail, record for the dashboard.
 * `request` is optional so a background job can use this too.
 */
export function captureRouteError(err: unknown, request: Request | undefined, ctx: ErrorContext = {}) {
  const url = request ? safeUrl(request.url) : null;
  void captureError(err, {
    route: ctx.route ?? url,
    method: ctx.method ?? request?.method ?? undefined,
    userAgent: ctx.userAgent ?? request?.headers.get("user-agent") ?? null,
    ...ctx,
  });
}

/** Just the path: a query string can carry a user's own text. */
function safeUrl(raw: string): string | null {
  try { return new URL(raw).pathname; } catch { return null; }
}
