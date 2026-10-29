import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";

/**
 * The bell.
 *
 * One endpoint serves both audiences, deciding from the session which rows
 * the caller is entitled to: their own, and — only for an admin — the ones
 * addressed to nobody in particular. The scope is never taken from the
 * request, so asking for the admin list is not something a student can do by
 * editing a query string.
 */

export const dynamic = "force-dynamic";

const LIMIT = 20;

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const isAdmin = auth.role === "admin";
  const db = supabaseAdmin();

  // An admin sees their own notifications and the unaddressed ones together,
  // because they are one person doing both jobs.
  const filter = isAdmin
    ? `user_id.eq.${auth.user.id},user_id.is.null`
    : `user_id.eq.${auth.user.id}`;

  try {
    const { data, error } = await db
      .from("notifications")
      .select("id,kind,title,body,href,read_at,created_at")
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(LIMIT);

    if (error) throw new Error(error.message);

    const items = data ?? [];
    return NextResponse.json({
      items,
      unread: items.filter((n) => !n.read_at).length,
    });
  } catch (err) {
    // A missing table means the migration has not been run. The bell showing
    // nothing is a better outcome than every page erroring.
    console.error("notifications read failed:", (err as Error)?.message);
    return NextResponse.json({ items: [], unread: 0 });
  }
}

/** Mark one as read, or all of them. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* an empty body means "all" */ }

  const id = typeof body.id === "string" ? body.id : "";
  const isAdmin = auth.role === "admin";
  const db = supabaseAdmin();

  try {
    let q = db.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);

    // Scoped to what this caller is allowed to touch, whichever row they named.
    q = isAdmin
      ? q.or(`user_id.eq.${auth.user.id},user_id.is.null`)
      : q.eq("user_id", auth.user.id);

    if (id) q = q.eq("id", id);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("notifications update failed:", (err as Error)?.message);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
