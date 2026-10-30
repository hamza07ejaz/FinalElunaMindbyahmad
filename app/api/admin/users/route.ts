import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { loadPlans } from "../../../../lib/tiers";
import { adminOrFail } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "users.view");
  if (!gate.ok) return gate.res;

  const sp = new URL(req.url).searchParams;
  const askedPlan = (sp.get("plan") ?? "").trim();
  const planFilter =
    ["free", "paid", "trial"].includes(askedPlan) ||
    (await loadPlans()).some((p) => p.slug === askedPlan)
      ? askedPlan
      : "all";
  const limit = Math.min(100, Math.max(5, Number(sp.get("limit")) || 25));
  const page = Math.max(0, Number(sp.get("page")) || 0);

  const { data, error } = await supabaseAdmin().rpc("admin_user_list", {
    p_search: (sp.get("q") ?? "").trim().slice(0, 120),
    // 'free', 'paid', 'trial' or an exact plan slug. Validated against the
    // plans that exist, so the filter cannot be used to probe the table.
    p_plan: planFilter,
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
  const plans = (await loadPlans()).map((p) => ({ slug: p.slug, name: p.name, isDefault: p.isDefault }));
  return NextResponse.json({
    plans,
    users: rows,
    total: rows[0]?.total_count ?? 0,
    page,
    limit,
  });
}
