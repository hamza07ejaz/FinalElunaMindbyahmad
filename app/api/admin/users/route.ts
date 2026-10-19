import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "users.view");
  if (!gate.ok) return gate.res;

  const sp = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit")) || 25));
  const page = Math.max(0, Number(sp.get("page")) || 0);

  const { data, error } = await supabaseAdmin().rpc("admin_user_list", {
    p_search: (sp.get("q") ?? "").trim().slice(0, 120),
    p_plan: ["free", "premium"].includes(sp.get("plan") ?? "") ? sp.get("plan") : "all",
    p_status: ["active", "blocked"].includes(sp.get("status") ?? "") ? sp.get("status") : "all",
    p_sort: ["usage", "email", "recent"].includes(sp.get("sort") ?? "") ? sp.get("sort") : "recent",
    p_limit: limit,
    p_offset: page * limit,
  });

  if (error) {
    console.error("admin_user_list failed:", error.message);
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }

  const rows = data ?? [];
  return NextResponse.json({
    users: rows,
    total: rows[0]?.total_count ?? 0,
    page,
    limit,
  });
}
