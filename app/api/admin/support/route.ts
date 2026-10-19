import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { isStatus } from "../../../../lib/support";
import { adminOrFail } from "../_helpers";

export const dynamic = "force-dynamic";

/** The staff inbox: filterable queue plus the counts the nav badge needs. */
export async function GET(req: Request) {
  const gate = await adminOrFail(req, "support");
  if (!gate.ok) return gate.res;

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const q = (sp.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit")) || 30));
  const page = Math.max(0, Number(sp.get("page")) || 0);

  const db = supabaseAdmin();
  let query = db.from("support_tickets")
    .select("id,user_id,email,subject,category,status,created_at,last_reply_at,unread_for_staff", { count: "exact" })
    .order("unread_for_staff", { ascending: false })   // anything waiting on us, first
    .order("last_reply_at", { ascending: false })
    .range(page * limit, page * limit + limit - 1);

  if (isStatus(status)) query = query.eq("status", status);
  else query = query.neq("status", "closed");          // the default view is the live queue
  if (q) query = query.or(`subject.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    console.error("admin support list failed:", error.message);
    return NextResponse.json({ error: "Could not load the support queue." }, { status: 500 });
  }

  const [{ count: waiting }, { count: open }] = await Promise.all([
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("unread_for_staff", true).neq("status", "closed"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
  ]);

  return NextResponse.json({
    tickets: data ?? [],
    total: count ?? 0,
    waiting: waiting ?? 0,
    open: open ?? 0,
    page, limit,
  });
}
