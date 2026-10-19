import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "users.view");
  if (!gate.ok) return gate.res;

  const db = supabaseAdmin();
  const days = Math.min(90, Math.max(7, Number(new URL(req.url).searchParams.get("days")) || 14));

  const [overview, series, features] = await Promise.all([
    db.rpc("admin_overview"),
    db.rpc("admin_daily_series", { p_days: days }),
    db.rpc("admin_feature_usage", { p_days: days }),
  ]);

  if (overview.error || series.error || features.error) {
    console.error("admin overview failed:", overview.error || series.error || features.error);
    return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
  }

  return NextResponse.json({
    overview: overview.data,
    series: series.data ?? [],
    features: features.data ?? [],
    days,
  });
}
