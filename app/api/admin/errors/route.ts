import { NextResponse } from "next/server";
import { logAdmin } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail, body, str } from "../_helpers";

export const dynamic = "force-dynamic";

const LEVELS = ["warn", "error", "fatal"];
const SOURCES = ["server", "client"];
const STATUSES = ["open", "resolved", "ignored"];

const pick = (v: string | null, allowed: string[], fallback: string) =>
  v && allowed.includes(v) ? v : fallback;

/** The dashboard's whole payload: headline numbers, the day series, and one page of groups. */
export async function GET(req: Request) {
  const gate = await adminOrFail(req, "errors");
  if (!gate.ok) return gate.res;

  const sp = new URL(req.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.get("days")) || 14));
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit")) || 30));
  const page = Math.max(0, Number(sp.get("page")) || 0);

  const db = supabaseAdmin();
  const [overview, groups] = await Promise.all([
    db.rpc("admin_error_overview", { p_days: days }),
    db.rpc("admin_error_groups", {
      p_status: pick(sp.get("status"), [...STATUSES, "all"], "open"),
      p_level: pick(sp.get("level"), [...LEVELS, "all"], "all"),
      p_source: pick(sp.get("source"), [...SOURCES, "all"], "all"),
      p_search: (sp.get("q") ?? "").trim().slice(0, 120),
      p_limit: limit,
      p_offset: page * limit,
    }),
  ]);

  if (overview.error || groups.error) {
    const message = overview.error?.message || groups.error?.message || "";
    console.error("admin errors load failed:", message);
    // The most likely cause by far is that migration 008 has not been run.
    const missing = /does not exist|could not find/i.test(message);
    return NextResponse.json({
      error: missing
        ? "The error tables are not set up yet. Run supabase/008_errors_and_billing.sql, then reload this page."
        : "Could not load the error data.",
      setupNeeded: missing,
    }, { status: missing ? 503 : 500 });
  }

  const rows = groups.data ?? [];
  return NextResponse.json({
    overview: overview.data,
    groups: rows,
    total: rows[0]?.total_count ?? 0,
    page, limit, days,
  });
}

/**
 * Admin actions:
 *   status "resolved" | "ignored" | "open"  on one fingerprint
 *   note                                     on one fingerprint
 *   prune true                                clears old occurrences
 */
export async function PATCH(req: Request) {
  const gate = await adminOrFail(req, "errors");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const db = supabaseAdmin();

  if (b.prune === true) {
    const keep = Math.min(365, Math.max(1, Number(b.keepDays) || 30));
    const { data, error } = await db.rpc("prune_errors", { p_keep_days: keep });
    if (error) return NextResponse.json({ error: "Could not prune." }, { status: 500 });
    await logAdmin(gate.admin, "errors.prune", `${keep}d`, data as Record<string, unknown>);
    return NextResponse.json({ ok: true, pruned: data });
  }

  const fingerprint = str(b.fingerprint, 200);
  if (!fingerprint) return NextResponse.json({ error: "Which error?" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const done: string[] = [];

  if (typeof b.status === "string" && STATUSES.includes(b.status)) {
    patch.status = b.status;
    patch.resolved_at = b.status === "resolved" ? new Date().toISOString() : null;
    patch.resolved_by = b.status === "resolved" ? gate.admin.user.id : null;
    done.push(b.status);
  }
  if (typeof b.note === "string") { patch.note = str(b.note, 1000); done.push("note"); }

  if (!done.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await db.from("error_groups").update(patch).eq("fingerprint", fingerprint);
  if (error) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });

  await logAdmin(gate.admin, "errors.update", fingerprint, { changes: done });
  return NextResponse.json({ ok: true, changed: done });
}
