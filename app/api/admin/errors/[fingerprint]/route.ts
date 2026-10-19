import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { adminOrFail } from "../../_helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ fingerprint: string }> };

/** One problem in full: the group, its 14-day shape, and the last 20 occurrences. */
export async function GET(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "errors");
  if (!gate.ok) return gate.res;

  const { fingerprint } = await params;
  const { data, error } = await supabaseAdmin().rpc("admin_error_detail", {
    p_fingerprint: decodeURIComponent(fingerprint),
  });

  if (error) {
    console.error("admin_error_detail failed:", error.message);
    return NextResponse.json({ error: "Could not load this error." }, { status: 500 });
  }
  if (!data?.group) return NextResponse.json({ error: "Error not found." }, { status: 404 });

  return NextResponse.json(data);
}
