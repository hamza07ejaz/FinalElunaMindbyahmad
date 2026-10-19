import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { captureRouteError } from "../../../lib/errors";
import { getSettings } from "../../../lib/settings";
import { checkoutMode, explainStripe, stripe } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BillingRow = {
  plan: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  card_trial_ends_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
};

const COLUMNS =
  "plan,subscription_status,stripe_customer_id,stripe_subscription_id,cancel_at_period_end,current_period_end,card_trial_ends_at,trial_started_at,trial_ends_at";

/** What the account page shows: the plan, the dates, and whether it is already cancelling. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { flags, branding } = await getSettings();

  const { data, error } = await supabaseAdmin()
    .from("profiles").select(COLUMNS).eq("id", auth.user.id).maybeSingle();

  if (error) {
    // Migration 008 adds most of these columns; without it the page still works,
    // it just cannot show renewal dates.
    console.error("billing load failed:", error.message);
    return NextResponse.json({
      plan: auth.plan, paidPlan: auth.paidPlan, onTrial: auth.onTrial,
      trialEndsAt: auth.trialEndsAt, canManage: false, setupNeeded: true,
      supportEmail: branding.supportEmail,
    });
  }

  const row = (data ?? {}) as BillingRow;
  const trialEnd = row.card_trial_ends_at ?? row.trial_ends_at ?? null;
  const onTrial =
    row.subscription_status === "trialing" ||
    (auth.paidPlan !== "premium" && !!trialEnd && new Date(trialEnd).getTime() > Date.now());

  return NextResponse.json({
    plan: auth.plan,
    paidPlan: auth.paidPlan,
    onTrial,
    trialEndsAt: trialEnd,
    status: row.subscription_status,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    renewsAt: row.current_period_end,
    // Only a real Stripe customer can be sent to the portal, and only while
    // Stripe is actually live — a demo upgrade has nothing to manage.
    canManage: !!row.stripe_customer_id && (await checkoutMode()) === "live",
    hasSubscription: !!row.stripe_subscription_id,
    trialUsed: !!row.trial_started_at,
    trialRequiresCard: flags.trialRequiresCard,
    trialDays: flags.trialDays,
    supportEmail: branding.supportEmail,
  });
}

/**
 * Opens Stripe's own billing portal.
 *
 * Cancelling, resuming, swapping the card and downloading invoices all live
 * there. That is deliberate: Stripe already handles proration, dunning and the
 * receipts, and rebuilding any of that here would be a worse version that also
 * has to be kept in sync with their rules.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    if ((await checkoutMode()) !== "live")
      return NextResponse.json(
        { error: "There is no real subscription to manage on this account." },
        { status: 400 }
      );

    const { data: profile } = await supabaseAdmin()
      .from("profiles").select("stripe_customer_id").eq("id", auth.user.id).maybeSingle();

    if (!profile?.stripe_customer_id)
      return NextResponse.json(
        { error: "There is no billing account yet. Start a plan first." },
        { status: 400 }
      );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const session = await (await stripe()).billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/dashboard/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("billing portal error:", (err as Error)?.message || err);
    captureRouteError(err, req, { route: "/api/billing", status: 500 });
    return NextResponse.json(
      { error: "Could not open the billing page. Please try again." },
      { status: 500 }
    );
  }
}
