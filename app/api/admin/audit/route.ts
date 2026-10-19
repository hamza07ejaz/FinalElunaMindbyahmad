import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "audit");
  if (!gate.ok) return gate.res;

  const limit = Math.min(200, Math.max(10, Number(new URL(req.url).searchParams.get("limit")) || 60));
  const { data, error } = await supabaseAdmin()
    .from("admin_audit").select("id,actor_email,action,target,detail,created_at")
    .order("created_at", { ascending: false }).limit(limit);

  if (error) return NextResponse.json({ error: "Could not load the activity log." }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}
