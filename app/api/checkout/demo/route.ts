import { NextResponse } from "next/server";
import { requireUser, logAdmin } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { checkoutMode } from "../../../../lib/stripe";
import { loadPlans, trialPlan } from "../../../../lib/tiers";

export const dynamic = "force-dynamic";

/**
 * Demo upgrade — for showing the flow before Stripe is live.
 *
 * This hands out Premium with no payment, so it is gated on `checkoutMode()`
 * rather than on DEMO_CHECKOUT directly. That matters: once a working Stripe key
 * is saved, real checkout is live, and this route shuts itself off even if
 * DEMO_CHECKOUT=1 was left set on the server. Otherwise anyone who knew the URL
 * could skip the paywall on a site that is taking real money.
 */
export async function POST(req: Request) {
  if ((await checkoutMode()) !== "demo")
    return NextResponse.json({ error: "Demo checkout is not enabled." }, { status: 404 });

  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (auth.blocked) return NextResponse.json({ error: "This account is suspended." }, { status: 403 });
  // Which plan a demo hands out follows the same rule as a trial: the entry
  // paid tier, not whichever one happens to be most expensive.
  const grant = trialPlan(await loadPlans());
  if (!grant) return NextResponse.json({ error: "There are no paid plans to demo." }, { status: 404 });
  if (auth.plan === grant.slug) return NextResponse.json({ ok: true, already: true });

  const { error } = await supabaseAdmin().from("profiles").update({ plan: grant.slug }).eq("id", auth.user.id);
  if (error) {
    console.error("demo upgrade failed:", error.message);
    return NextResponse.json({ error: "Could not switch your plan. Please try again." }, { status: 500 });
  }

  // Leave a trail, so a demo upgrade is never mistaken for a real sale.
  await logAdmin(auth, "demo.upgrade", auth.user.email ?? auth.user.id, {
    note: `Demo checkout, no payment taken. Granted ${grant.slug}.`,
  });
  return NextResponse.json({ ok: true });
}
