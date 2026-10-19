import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { fingerprint, scrub } from "../../../lib/errors";
import { supabaseAdmin } from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browser crashes, reported by the page itself.
 *
 * This endpoint is reachable without logging in — a crash on the login page is
 * exactly the kind worth knowing about — so everything here assumes the body is
 * hostile: fields are capped, the level is fixed, and the fingerprint is
 * computed on the server so nobody can spray a thousand fake groups into the
 * dashboard by varying one field.
 */

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

/** A crude per-instance throttle. Serverless means per-container, which is enough
 *  to stop a render loop from writing thousands of rows from one browser. */
const seen = new Map<string, number>();
const THROTTLE_MS = 10_000;

function throttled(key: string) {
  const now = Date.now();
  const last = seen.get(key);
  if (last && now - last < THROTTLE_MS) return true;
  seen.set(key, now);
  // Keep the map from growing without bound in a long-lived container.
  if (seen.size > 500) for (const [k, t] of seen) if (now - t > THROTTLE_MS) seen.delete(k);
  return false;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? scrub(v.trim()).slice(0, max) : "");

/**
 * Nothing worth recording — accepted and dropped.
 *
 * This was `NextResponse.json({ ok: false }, { status: 204 })`, which threw:
 * 204 means "no content" and a body on it is invalid. Returning a bare
 * `new Response(null, { status: 204 })` throws here too — this Next version
 * rejects a 204 from a route handler whichever way it is built.
 *
 * So every junk or too-short report — precisely the case this path exists to
 * absorb — came back as a 500. Nothing surfaced it, because the browser does
 * not read the reply and a failure to report an error is invisible by nature.
 *
 * 202 says what is true: received, deliberately not acted on.
 */
const nothingToDo = () => NextResponse.json({ ok: false, ignored: true }, { status: 202 });

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return nothingToDo(); }

  const message = text(body.message, MAX_MESSAGE);
  if (message.length < 3) return nothingToDo();

  const name = text(body.name, 80) || "Error";
  const stack = text(body.stack, MAX_STACK) || null;
  const route = text(body.route, 200) || null;
  const fp = fingerprint(name, message, route);

  if (throttled(fp)) return NextResponse.json({ ok: true, throttled: true });

  // Identity is read from the session, never from the body.
  const auth = await requireUser(req).catch(() => null);

  // Wrapped because this endpoint must never fail. It exists to catch errors;
  // if it throws one of its own, the page's error handler reports that too and
  // the two feed each other.
  try {
    const { error } = await supabaseAdmin().rpc("record_error", {
      p_fingerprint: fp,
      p_level: "error",
      p_source: "client",
      p_name: name,
      p_message: message,
      p_route: route,
      p_method: null,
      p_status: null,
      p_stack: stack,
      p_user: auth?.user.id ?? null,
      p_email: auth?.user.email ?? null,
      p_agent: req.headers.get("user-agent"),
      p_context: {
        kind: text(body.kind, 40) || "error",
        viewport: text(body.viewport, 20) || null,
      },
      p_sample_secs: 60,   // the browser is noisier than the server
    });
    if (error) console.error("client error record failed:", error.message);
  } catch (err) {
    console.error("client error record threw:", (err as Error)?.message);
  }

  // The browser does not care either way, and a failure here must not turn into
  // a second error on the page.
  return NextResponse.json({ ok: true });
}
