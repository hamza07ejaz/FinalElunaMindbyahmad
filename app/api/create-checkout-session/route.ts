import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { captureRouteError } from "../../../lib/errors";
import { getSettings } from "../../../lib/settings";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { checkoutMode, explainStripe, readiness, stripe, stripeConfig } from "../../../lib/stripe";
import { loadPlans, purchasablePlans } from "../../../lib/tiers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Identity comes from the session, never from the request body.
    const auth = await requireUser(req);
    if (!auth) return NextResponse.json({ error: "Please log in first." }, { status: 401 });

    /**
     * Which plan is being bought.
     *
     * The body names a slug; the price comes from that plan's row, never from
     * the request. Sending a price id straight through would let anyone put
     * any Stripe price in the request and buy the top tier for the cost of
     * whichever price they liked the look of.
     *
     * With no slug — an older cached page, or the single-plan case — the
     * cheapest purchasable plan is used, which is what the one Upgrade button
     * used to mean.
     */
    const plans = await loadPlans();
    const buyable = purchasablePlans(plans);
    const asked = String(((await req.json().catch(() => ({}))) as { plan?: unknown }).plan ?? "").trim();
    const wanted = (asked && buyable.find((p) => p.slug === asked)) || buyable[0] || null;

    if (!wanted)
      return NextResponse.json(
        { error: "There is nothing to buy yet. Please contact support." },
        { status: 503 },
      );
    if (asked && wanted.slug !== asked)
      return NextResponse.json({ error: "That plan is not available." }, { status: 400 });
    if (auth.paidPlan === wanted.slug)
      return NextResponse.json({ error: `You're already on ${wanted.name}.` }, { status: 400 });

    /**
     * Which checkout runs is decided by whether Stripe is actually usable, not
     * by a separate switch someone has to remember to flip. Saving a working key
     * and a price in the admin panel is what turns real payments on; there is no
     * second step, and so no way to be live in one place and demo in another.
     */
    const mode = await checkoutMode();

    if (mode === "demo") return NextResponse.json({ url: "/checkout/demo" });
    if (mode === "off") {
      const config = await stripeConfig();
      const { problems } = readiness(config, buyable.length);
      console.error("checkout attempted before payments were set up:", problems.join(" "));
      // The reason goes to the admin dashboard; the customer gets something
      // they can act on, which is "tell someone", not "add a webhook secret".
      captureRouteError(new Error(`Checkout not configured: ${problems.join(" ")}`), req, {
        route: "/api/create-checkout-session", status: 503,
      });
      return NextResponse.json({
        error: "Payments are not switched on yet. Please contact support — this is not a problem with your card.",
      }, { status: 503 });
    }

    const config = await stripeConfig();
    const { flags } = await getSettings();

    const { data: profile } = await supabaseAdmin()
      .from("profiles").select("stripe_customer_id,trial_started_at").eq("id", auth.user.id).single();

    /**
     * The trial is attached to the subscription, so Stripe runs it: the card is
     * authorised now, nothing is charged until the trial ends, and cancelling
     * before then costs the user nothing.
     *
     * It is offered once per account — `trial_started_at` is the record of that,
     * and it is stamped whichever way the trial was started.
     */
    const offerTrial =
      flags.trialEnabled && flags.trialRequiresCard && !profile?.trial_started_at && !auth.trialUsed;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;

    const session = await (await stripe()).checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: wanted.stripePriceId || config.priceId, quantity: 1 }],
      success_url: `${appUrl}/success`,
      cancel_url: `${appUrl}/pricing`,
      client_reference_id: auth.user.id,
      metadata: { user_id: auth.user.id, plan: wanted.slug },
      subscription_data: {
        // The slug travels with the subscription so the webhook knows which
        // plan to grant even if the price is later renamed or replaced.
        metadata: { user_id: auth.user.id, plan: wanted.slug },
        ...(offerTrial ? { trial_period_days: flags.trialDays } : {}),
      },
      allow_promotion_codes: true,
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: auth.user.email }),
    });

    // Stamp the trial as used at the moment it is offered, so a cancelled
    // checkout cannot be replayed for a second trial.
    if (offerTrial) {
      await supabaseAdmin().from("profiles")
        .update({ trial_started_at: new Date().toISOString() })
        .eq("id", auth.user.id)
        .is("trial_started_at", null);
    }

    /*
     * Hand back the amount as well as the link.
     *
     * A begin_checkout event with no value is reported as a zero-value
     * checkout, and an ad platform optimising towards value learns from that
     * zero. Reading it off the session Stripe just built means the figure is
     * whatever Stripe will actually charge, rather than a number copied into
     * the front end once and left behind at the next price change.
     */
    const minor = session.amount_total ?? 0;
    const cur = (session.currency ?? "usd").toLowerCase();
    const ZERO_DECIMAL = ["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"];

    return NextResponse.json({
      url: session.url,
      plan: wanted.slug,
      planName: wanted.name,
      trialDays: offerTrial ? flags.trialDays : 0,
      value: ZERO_DECIMAL.includes(cur) ? minor : minor / 100,
      currency: cur.toUpperCase(),
    });
  } catch (err) {
    // The Stripe reason is logged for the admin and withheld from the customer:
    // "no such price in test mode" is actionable for one and alarming for the other.
    console.error("create-checkout-session error:", explainStripe(err));
    captureRouteError(err, req, { route: "/api/create-checkout-session", status: 500 });
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 });
  }
}
