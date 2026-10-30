import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { logAdmin } from "../../../../lib/auth";
import { FEATURES } from "../../../../lib/plans";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { clearPlanCache, loadPlans } from "../../../../lib/tiers";
import { adminOrFail, body, str } from "../_helpers";

export const dynamic = "force-dynamic";

/**
 * The plans an owner sells.
 *
 * Tiers used to be two words in the code, so adding a third was a developer
 * job. They are rows now, and this is the only way in: create, edit, reorder,
 * switch off, delete. Everything the app does with a plan — what the pricing
 * page shows, what checkout charges, what the daily limits are, what the
 * webhook grants — reads those rows.
 */

/** A slug is part of a URL and is stored against every account, so it is strict. */
function cleanSlug(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const RESERVED = ["new", "all", "paid", "trial", "none"];

/** Uses per day. Anything unusable becomes 0, which reads as "not in this plan". */
function cleanLimits(v: unknown): Record<string, number> {
  const raw = (v ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const f of FEATURES) {
    const n = Math.round(Number(raw[f]));
    out[f] = Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 0;
  }
  return out;
}

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;
  return NextResponse.json({ plans: await loadPlans(true) });
}

/**
 * Saves the whole set in one call.
 *
 * Deliberately not one row at a time: "exactly one plan is the default" and
 * "the order is 0,1,2…" are facts about the set, and saving rows one by one
 * means every intermediate state breaks one of them. The client sends what the
 * screen shows and gets back what was stored.
 */
export async function PUT(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const incoming = Array.isArray(b.plans) ? b.plans : null;
  if (!incoming) return NextResponse.json({ error: "Missing plans." }, { status: 400 });
  if (incoming.length === 0) return NextResponse.json({ error: "There has to be at least one plan." }, { status: 400 });
  if (incoming.length > 12) return NextResponse.json({ error: "Twelve plans is the most this screen supports." }, { status: 400 });

  const rows = [];
  const seen = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const p = (incoming[i] ?? {}) as Record<string, unknown>;
    const slug = cleanSlug(p.slug) || cleanSlug(p.name);

    if (!slug) return NextResponse.json({ error: `Plan ${i + 1} needs a name.` }, { status: 400 });
    if (RESERVED.includes(slug))
      return NextResponse.json({ error: `"${slug}" is a reserved word. Pick another name.` }, { status: 400 });
    if (seen.has(slug))
      return NextResponse.json({ error: `Two plans would both be called "${slug}". Names have to differ.` }, { status: 400 });
    seen.add(slug);

    rows.push({
      slug,
      name: str(p.name, 60) || slug,
      blurb: str(p.blurb, 200),
      price_label: str(p.priceLabel, 40),
      period_label: str(p.periodLabel, 60),
      stripe_price_id: str(p.stripePriceId, 100),
      features: (Array.isArray(p.features) ? p.features : [])
        .map((f) => str(f, 120)).filter(Boolean).slice(0, 20),
      limits: cleanLimits(p.limits),
      is_default: false, // set once, below
      sort: i,
      enabled: p.enabled !== false,
      updated_at: new Date().toISOString(),
    });
  }

  /*
   * Exactly one default, and it is the plan new accounts land on.
   *
   * Whoever is marked wins; failing that, the first one. Zero defaults would
   * leave every new signup resolving to no plan at all, and two would make it
   * a coin toss, so this is settled here rather than trusted to the client.
   */
  const asked = incoming.findIndex((p) => (p as Record<string, unknown>)?.isDefault === true);
  rows[asked >= 0 ? asked : 0].is_default = true;

  const db = supabaseAdmin();

  /*
   * The default has to be cleared before the new set goes in.
   *
   * There is a unique index allowing one default row, so upserting a new
   * default while the old one still holds the flag fails on that index. This
   * clears it first, inside the same request, rather than dropping the index —
   * the index is what stops two defaults existing at all.
   */
  const { error: clearErr } = await db.from("plans").update({ is_default: false }).eq("is_default", true);
  if (clearErr) {
    console.error("could not clear the default plan:", clearErr.message);
    return NextResponse.json({ error: "Could not save the plans." }, { status: 500 });
  }

  const { error } = await db.from("plans").upsert(rows, { onConflict: "slug" });
  if (error) {
    console.error("plans upsert failed:", error.message);
    // The default was just cleared, so put the old one back rather than
    // leaving the site with no plan for new accounts.
    await db.from("plans").update({ is_default: true }).eq("slug", rows[0].slug);
    return NextResponse.json({ error: "Could not save the plans." }, { status: 500 });
  }

  clearPlanCache();
  // The pricing page and the landing page are prerendered, so a saved plan has
  // to force them to rebuild or the change sits in the database unseen.
  revalidatePath("/");
  revalidatePath("/pricing");

  await logAdmin(gate.admin, "plans.save", rows.map((r) => r.slug).join(","));
  return NextResponse.json({ ok: true, plans: await loadPlans(true) });
}

/**
 * Deletes one plan.
 *
 * Accounts on it are moved to the default plan first. Leaving them pointed at
 * a row that no longer exists would work — the app falls back to the default
 * when it cannot resolve a slug — but it would also mean the admin screens
 * showing a plan name nobody can explain, and no way to tell who used to pay
 * for what.
 */
export async function DELETE(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const slug = cleanSlug(new URL(req.url).searchParams.get("slug"));
  if (!slug) return NextResponse.json({ error: "Which plan?" }, { status: 400 });

  const plans = await loadPlans(true);
  const target = plans.find((p) => p.slug === slug);
  if (!target) return NextResponse.json({ error: "That plan does not exist." }, { status: 404 });
  if (target.isDefault)
    return NextResponse.json(
      { error: "That is the free plan new accounts start on. Make another plan the default first." },
      { status: 400 },
    );

  const fallback = plans.find((p) => p.isDefault)?.slug ?? "free";
  const db = supabaseAdmin();

  const { count, error: moveErr } = await db
    .from("profiles").update({ plan: fallback }, { count: "exact" }).eq("plan", slug);
  if (moveErr) {
    console.error("could not move accounts off the plan:", moveErr.message);
    return NextResponse.json({ error: "Could not move the accounts on that plan. Nothing was deleted." }, { status: 500 });
  }

  const { error } = await db.from("plans").delete().eq("slug", slug);
  if (error) {
    console.error("plan delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete that plan." }, { status: 500 });
  }

  clearPlanCache();
  revalidatePath("/");
  revalidatePath("/pricing");

  await logAdmin(gate.admin, "plans.delete", slug, { movedAccounts: count ?? 0, to: fallback });
  return NextResponse.json({ ok: true, moved: count ?? 0, to: fallback, plans: await loadPlans(true) });
}
