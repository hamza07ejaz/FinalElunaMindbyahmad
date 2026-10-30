import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, stripeConfig } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { captureError } from "../../../lib/errors";
import { notes } from "../../../lib/notify";
import { defaultPlan, loadPlans, planForPrice, purchasablePlans, type PlanRow } from "../../../lib/tiers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Match = { userId?: string | null; customerId?: string | null };

async function setPlan(match: Match, plan: string, extra: Record<string, unknown> = {}) {
  const db = supabaseAdmin();
  let q = db.from("profiles").update({ plan, ...extra });
  if (match.userId) q = q.eq("id", match.userId);
  else if (match.customerId) q = q.eq("stripe_customer_id", match.customerId);
  else return;
  const { error } = await q;
  if (error) throw new Error(`profiles update failed: ${error.message}`);
}

/**
 * Which plan this payment bought.
 *
 * The price Stripe charged is the authority: it is the thing the customer
 * actually agreed to, and it cannot be forged the way a metadata field copied
 * from a checkout session could be. The slug in metadata is the fallback for
 * the case where an owner has since swapped a plan's price in Stripe, and the
 * cheapest purchasable plan is the last resort so that a payment always grants
 * *something* rather than silently leaving a paying customer on free.
 */
async function boughtPlan(priceId: string | null, slug: string | null | undefined): Promise<PlanRow | null> {
  const plans = await loadPlans(true);
  const byPrice = planForPrice(plans, priceId ?? "");
  if (byPrice) return byPrice;

  const bySlug = slug ? plans.find((p) => p.slug === slug && !p.isDefault) : null;
  if (bySlug) return bySlug;

  const fallback = purchasablePlans(plans)[0] ?? plans.find((p) => !p.isDefault) ?? null;
  if (fallback) {
    console.error(
      `Payment for price ${priceId ?? "(none)"} matched no plan. Granting ${fallback.slug}. ` +
      "Check the Stripe price id saved against each plan.",
    );
  }
  return fallback;
}

/** The price on a subscription, which is what the plan is looked up by. */
function priceOf(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/** Where a cancelled or unpaid subscription lands. */
async function freeSlug(): Promise<string> {
  return defaultPlan(await loadPlans()).slug;
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/**
 * When the current billing period ends.
 *
 * Stripe moved this field from the subscription onto its items in a later API
 * version than the one pinned here, so both places are checked: whichever the
 * live API sends, the renewal date still reaches the database.
 */
function periodEnd(sub: Stripe.Subscription): string | null {
  const fromSub = (sub as unknown as { current_period_end?: number }).current_period_end;
  const fromItem = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const unix = fromSub ?? fromItem?.current_period_end;
  return typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const config = await stripeConfig();
  if (!config.webhookSecret) {
    // Nothing can be verified, so nothing is acted on. Said out loud because the
    // alternative is a customer paying and silently staying on the free plan.
    console.error("Webhook received but no signing secret is configured.");
    void captureError(new Error("Stripe webhook received with no signing secret configured"), {
      level: "fatal", route: "/api/stripe-webhook", status: 503,
    });
    return NextResponse.json({ error: "Webhook signing secret is not configured." }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = (await stripe()).webhooks.constructEvent(await req.text(), sig, config.webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature error:", err?.message);
    void captureError(err, { level: "warn", route: "/api/stripe-webhook", status: 400 });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: Stripe retries events, so process each event id only once.
  const db = supabaseAdmin();
  const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dup?.code === "23505") return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode !== "subscription") break;
        const userId = s.client_reference_id || s.metadata?.user_id;

        // Line items are not on the session object the webhook receives, so the
        // price is read back from Stripe rather than guessed from the amount.
        let priceId: string | null = null;
        try {
          const items = await (await stripe()).checkout.sessions.listLineItems(s.id, { limit: 1 });
          priceId = items.data[0]?.price?.id ?? null;
        } catch (err) {
          console.error("could not read checkout line items:", (err as Error)?.message);
        }

        const bought = await boughtPlan(priceId, s.metadata?.plan);
        if (!bought) throw new Error("A payment succeeded but no plan exists to grant.");

        await setPlan({ userId }, bought.slug, {
          stripe_customer_id: idOf(s.customer as any),
          stripe_subscription_id: idOf(s.subscription as any),
        });

        /*
         * Write down the sale so a conversion tag can report it later with the
         * amount Stripe actually charged.
         *
         * This is the only place in the app that knows a payment succeeded.
         * Firing the tag from the success page instead would report a sale
         * every time anyone opened that URL — on a refresh, on the back
         * button, on a second device — and an ad platform cannot tell those
         * apart from real ones.
         *
         * The session id is the primary key, so a webhook Stripe retries
         * conflicts instead of adding a second row.
         */
        if (userId) {
          const { error: convErr } = await db.from("conversions").insert({
            id: s.id,
            user_id: userId,
            amount_total: s.amount_total ?? 0,
            currency: (s.currency ?? "usd").toLowerCase(),
            // So the purchase event can report revenue per plan.
            plan: bought.slug,
          });
          // A duplicate is the expected case on a retry. Anything else is
          // logged and ignored: a missed conversion tag must never cost the
          // customer the plan they paid for.
          if (convErr && convErr.code !== "23505") {
            console.error("conversion record failed:", convErr.message);
          }

          // Only on the first insert, so a webhook Stripe retries does not
          // ring the bell a second time.
          if (!convErr) {
            notes.planChanged(userId, bought.name);
            const paid = ((s.amount_total ?? 0) / 100).toFixed(2);
            notes.payment(s.customer_details?.email ?? "a customer", `${paid} ${(s.currency ?? "usd").toUpperCase()}`);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        const match = { userId: sub.metadata?.user_id, customerId: idOf(sub.customer as any) };

        // Record what Stripe says, so the app can tell the user "trial, 3 days
        // left" or "cancels on the 30th" instead of a bare "premium".
        const state = {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          cancel_at_period_end: !!sub.cancel_at_period_end,
          card_trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          current_period_end: periodEnd(sub),
        };

        if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
          await setPlan(match, await freeSlug(), state);
        } else {
          /*
           * active, trialing, past_due and incomplete all keep the plan the
           * subscription is for — resolved from its current price, so a
           * customer who switches plan in Stripe's portal is moved here too
           * rather than staying on whatever they first bought.
           *
           * past_due deliberately keeps access while Stripe retries the card:
           * cutting someone off on the first failed retry loses the customer
           * more often than it saves the margin.
           */
          const current = await boughtPlan(priceOf(sub), sub.metadata?.plan);
          if (!current) throw new Error("A subscription is active but no plan exists to grant.");
          await setPlan(match, current.slug, state);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await setPlan({ userId: sub.metadata?.user_id, customerId: idOf(sub.customer as any) }, await freeSlug(), {
          subscription_status: "canceled",
          cancel_at_period_end: false,
          current_period_end: null,
          card_trial_ends_at: null,
        });
        break;
      }
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err?.message || err);
    // A webhook that fails silently means someone paid and did not get Premium,
    // so this one is fatal rather than just an error.
    await captureError(err, {
      level: "fatal", route: "/api/stripe-webhook", status: 500,
      extra: { event: event.type, eventId: event.id },
    });
    await db.from("stripe_events").delete().eq("id", event.id); // allow Stripe to retry
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
