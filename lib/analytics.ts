"use client";

/**
 * Marketing events.
 *
 * Everything an ad platform learns about this site goes through this one
 * function, for a reason that matters more here than on most sites: the people
 * using it are students, and what they do inside it is their coursework. A
 * file name is often their real name and their assignment title. A prompt is
 * what they do not understand yet. None of that is anybody's conversion data.
 *
 * So the rule is not "remember not to send personal information" — a rule like
 * that holds until the first busy afternoon. Only the parameters named below
 * are ever pushed, whatever a caller passes, and everything else is dropped
 * silently. A tag can only receive what this list allows.
 */

/** The complete set of parameters any event may carry. Nothing else survives. */
const ALLOWED = new Set([
  "event",
  "method",          // "password" | "google"
  "tool",            // which study tool, e.g. "notes"
  "file_kind",       // "document" | "image" | "audio" — never the name
  "size_bucket",     // "small" | "medium" | "large" — never the byte count
  "plan",            // a plan slug, e.g. "premium" — never a person
  "value",           // a number, for purchases and checkout starts
  "currency",        // ISO code
  "transaction_id",  // Stripe's id for the payment
  "items",           // the single plan being bought, for GA4 ecommerce
]);

/**
 * Keys that look harmless and are not. Listed separately from the allowlist
 * so that the reason survives: each of these has been a real leak somewhere.
 */
const NEVER = ["email", "user_id", "name", "file_name", "filename", "title",
               "topic", "prompt", "text", "content", "query", "answer"];

type Params = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** Keep only the allowed keys, and only values a tag can actually use. */
function clean(params: Params): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (!ALLOWED.has(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      // A string parameter is a label, never prose. Anything longer than this
      // is a sign something was passed that should not have been.
      out[k] = v.slice(0, 60);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (k === "items" && Array.isArray(v)) {
      out[k] = v.slice(0, 5).map((it) => {
        const o = (it ?? {}) as Params;
        return {
          item_id: String(o.item_id ?? "").slice(0, 40),
          item_name: String(o.item_name ?? "").slice(0, 60),
          price: typeof o.price === "number" ? o.price : undefined,
          quantity: 1,
        };
      });
    }
  }
  return out;
}

/**
 * Push one event to the data layer.
 *
 * Safe to call before GTM has loaded, and safe to call when it never loads:
 * the array exists either way and nothing downstream breaks.
 */
export function track(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ...clean(params), event });
  } catch {
    // Analytics must never be able to break the thing being measured.
  }
}

/** A size band, so the shape of a file is reportable and the file is not. */
export function sizeBucket(bytes: number): "small" | "medium" | "large" {
  if (bytes < 512 * 1024) return "small";
  if (bytes < 4 * 1024 * 1024) return "medium";
  return "large";
}

/* ------------------------------------------------------------------ */
/* The six events, named so a tag manager can trigger on them          */
/* ------------------------------------------------------------------ */

export const analytics = {
  signUp: (method: "password" | "google") => track("sign_up", { method }),
  login: (method: "password" | "google") => track("login", { method }),

  /** A study file that uploaded and was read. Nothing about what is in it. */
  fileUpload: (fileKind: string, bytes: number) =>
    track("file_upload", { file_kind: fileKind, size_bucket: sizeBucket(bytes) }),

  /** A tool that finished and produced something. The tool, not the subject. */
  aiActionComplete: (tool: string) => track("ai_action_complete", { tool }),

  /**
   * @param plan the plan's slug, so revenue can be reported per tier. A slug
   *   is a product name, not anything about the person buying it.
   */
  beginCheckout: (value: number, currency: string, plan = "") =>
    track("begin_checkout", {
      value, currency,
      items: [{ item_id: plan || "plan", item_name: plan || "plan", price: value }],
    }),

  /** Only ever called with a payment Stripe has already confirmed. */
  purchase: (transactionId: string, value: number, currency: string, plan = "") =>
    track("purchase", {
      transaction_id: transactionId, value, currency,
      items: [{ item_id: plan || "plan", item_name: plan || "plan", price: value }],
    }),
};

/** Exported for the tests that prove the filter holds. */
export const __analyticsInternals = { clean, ALLOWED, NEVER };
