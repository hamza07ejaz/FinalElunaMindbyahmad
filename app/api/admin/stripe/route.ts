import { NextResponse } from "next/server";
import { logAdmin } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import {
  clearStripeCache, clientFor, explainStripe, keyMode, maskKey, readiness, stripeConfig,
} from "../../../../lib/stripe";
import { adminOrFail, body, str } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Payments setup.
 *
 * The aim is that an admin pastes one secret key and everything else can be done
 * from this screen: pick or create the price, create the webhook endpoint, and
 * see the account it is all pointing at. The alternative is a checklist across
 * two dashboards where the one step people miss — the webhook — is the step that
 * silently takes money without delivering anything.
 *
 * Secret keys are write-only from the browser's side: they can be replaced but
 * never read back, and every response masks them to a preview.
 */

const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
] as const;

function appUrl(req: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
}
const webhookUrlFor = (req: Request) => `${appUrl(req)}/api/stripe-webhook`;

/** The whole state of the setup, with nothing secret in it. */
async function state(req: Request) {
  const c = await stripeConfig(true);
  const r = readiness(c);
  const wanted = webhookUrlFor(req);

  return {
    source: c.source,
    enabled: c.enabled,
    mode: r.mode,
    ready: r.ready,
    problems: r.problems,
    accountName: c.accountName,
    secretPreview: maskKey(c.secretKey),
    publishableKey: c.publishableKey,   // public by design
    priceId: c.priceId,
    hasWebhookSecret: !!c.webhookSecret,
    webhookUrl: c.webhookUrl,
    // The endpoint can be left pointing at an old host after a move, which is
    // exactly the kind of thing nobody notices until a payment goes missing.
    webhookUrlMatches: !c.webhookUrl || c.webhookUrl === wanted,
    expectedWebhookUrl: wanted,
    envFallback: {
      secret: !!process.env.STRIPE_SECRET_KEY?.trim(),
      price: !!process.env.STRIPE_PRICE_ID?.trim(),
      webhook: !!process.env.STRIPE_WEBHOOK_SECRET?.trim(),
    },
    demoCheckoutEnv: process.env.DEMO_CHECKOUT === "1",
  };
}

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  try {
    return NextResponse.json(await state(req));
  } catch (err) {
    const missing = /does not exist|could not find/i.test((err as Error)?.message ?? "");
    return NextResponse.json({
      error: missing
        ? "The payments table is not set up yet. Run supabase/012_stripe_config.sql, then reload."
        : "Could not load the payment settings.",
      setupNeeded: missing,
    }, { status: missing ? 503 : 500 });
  }
}

/** Save keys. Blank fields are left alone rather than wiped. */
export async function POST(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const patch: Record<string, unknown> = {};
  const done: string[] = [];

  const secretKey = str(b.secretKey, 300);
  if (secretKey) {
    if (!/^(?:sk|rk)_(?:live|test)_/.test(secretKey))
      return NextResponse.json({
        error: "That is not a Stripe secret key. It starts with sk_test_ or sk_live_ — the pk_ one is the publishable key and cannot take payments.",
      }, { status: 400 });

    // Never save a key without proving it works first: a typo here means every
    // checkout fails, and the customer is the one who finds out.
    try {
      const account = await clientFor(secretKey).accounts.retrieve();
      patch.account_name = (account.settings?.dashboard?.display_name || account.business_profile?.name || account.id || "").slice(0, 120);
      patch.status = "ok";
      patch.last_error = null;
      patch.last_checked_at = new Date().toISOString();
    } catch (err) {
      return NextResponse.json({ error: explainStripe(err) }, { status: 400 });
    }

    patch.secret_key = secretKey;
    done.push(`key (${keyMode(secretKey)} mode)`);

    // A key from a different account invalidates everything derived from the old
    // one. Clearing them is safer than leaving a live price that no longer exists.
    const current = await stripeConfig(true);
    if (current.secretKey && keyMode(current.secretKey) !== keyMode(secretKey)) {
      patch.price_id = "";
      patch.webhook_secret = "";
      patch.webhook_endpoint_id = "";
      patch.webhook_url = "";
      done.push("cleared the old price and webhook, which belonged to the other mode");
    }
  }

  const publishableKey = str(b.publishableKey, 300);
  if (publishableKey) {
    if (!/^pk_(?:live|test)_/.test(publishableKey))
      return NextResponse.json({ error: "A publishable key starts with pk_test_ or pk_live_." }, { status: 400 });
    patch.publishable_key = publishableKey;
    done.push("publishable key");
  }

  const priceId = str(b.priceId, 120);
  if (priceId) {
    if (!/^price_/.test(priceId))
      return NextResponse.json({ error: "A price id starts with price_. A prod_ id is the product, not the price." }, { status: 400 });
    patch.price_id = priceId;
    done.push("price");
  }

  // Pasting the signing secret by hand stays possible, for an endpoint that was
  // created in the Stripe dashboard rather than from this page.
  const webhookSecret = str(b.webhookSecret, 300);
  if (webhookSecret) {
    if (!/^whsec_/.test(webhookSecret))
      return NextResponse.json({ error: "A webhook signing secret starts with whsec_." }, { status: 400 });
    patch.webhook_secret = webhookSecret;
    patch.webhook_url = webhookUrlFor(req);
    done.push("webhook secret");
  }

  if (typeof b.enabled === "boolean") { patch.enabled = b.enabled; done.push(b.enabled ? "switched on" : "switched off"); }

  if (!done.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { error } = await supabaseAdmin().from("stripe_config").update(patch).eq("id", 1);
  if (error) {
    console.error("stripe config save failed:", error.message);
    return NextResponse.json({ error: "Could not save. Has supabase/012_stripe_config.sql been run?" }, { status: 500 });
  }

  clearStripeCache();
  // What changed, never the values.
  await logAdmin(gate.admin, "stripe.config.update", "payments", { changes: done });
  return NextResponse.json({ ok: true, changed: done, ...(await state(req)) });
}

/** Check the saved setup end to end, without changing anything. */
export async function PUT(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const c = await stripeConfig(true);
  if (!c.secretKey) return NextResponse.json({ error: "Add a secret key first." }, { status: 400 });

  const checks: { label: string; ok: boolean; detail: string }[] = [];
  const client = clientFor(c.secretKey);

  try {
    const account = await client.accounts.retrieve();
    const name = account.settings?.dashboard?.display_name || account.business_profile?.name || account.id;
    checks.push({ label: "Secret key", ok: true, detail: `Connected to ${name} in ${keyMode(c.secretKey)} mode.` });

    // charges_enabled is the difference between "Stripe accepts the key" and
    // "Stripe will actually take money", which is not the same question.
    if (keyMode(c.secretKey) === "live" && account.charges_enabled === false)
      checks.push({ label: "Account status", ok: false, detail: "This live account cannot take charges yet — Stripe still needs details from you in their dashboard." });
  } catch (err) {
    checks.push({ label: "Secret key", ok: false, detail: explainStripe(err) });
    await supabaseAdmin().from("stripe_config")
      .update({ status: "failed", last_error: explainStripe(err).slice(0, 500), last_checked_at: new Date().toISOString() }).eq("id", 1);
    return NextResponse.json({ checks, ok: false });
  }

  if (!c.priceId) {
    checks.push({ label: "Price", ok: false, detail: "No price chosen, so there is nothing to sell." });
  } else {
    try {
      const price = await client.prices.retrieve(c.priceId, { expand: ["product"] });
      if (!price.active) checks.push({ label: "Price", ok: false, detail: "That price is archived in Stripe and cannot be bought." });
      else if (!price.recurring) checks.push({ label: "Price", ok: false, detail: "That is a one-off price. A subscription needs a recurring one." });
      else {
        const product = price.product as { name?: string } | string;
        const name = typeof product === "string" ? product : product?.name ?? "";
        checks.push({
          label: "Price", ok: true,
          detail: `${name ? `${name} — ` : ""}${money(price.unit_amount, price.currency)} every ${price.recurring.interval}.`,
        });
      }
    } catch (err) {
      checks.push({ label: "Price", ok: false, detail: explainStripe(err) });
    }
  }

  if (!c.webhookSecret) {
    checks.push({ label: "Webhook", ok: false, detail: "Not set up. Without it a customer can pay and never be upgraded." });
  } else {
    const wanted = webhookUrlFor(req);
    try {
      if (c.webhookEndpointId) {
        const ep = await client.webhookEndpoints.retrieve(c.webhookEndpointId);
        const missing = EVENTS.filter((e) => !(ep.enabled_events as string[]).includes(e) && !(ep.enabled_events as string[]).includes("*"));
        if (ep.status !== "enabled") checks.push({ label: "Webhook", ok: false, detail: "The endpoint is disabled in Stripe." });
        else if (ep.url !== wanted) checks.push({ label: "Webhook", ok: false, detail: `It points at ${ep.url}, but this site is ${wanted}. Create it again.` });
        else if (missing.length) checks.push({ label: "Webhook", ok: false, detail: `Missing events: ${missing.join(", ")}. Create it again.` });
        else checks.push({ label: "Webhook", ok: true, detail: `Pointing at ${ep.url}.` });
      } else {
        checks.push({ label: "Webhook", ok: true, detail: `A signing secret is saved${c.webhookUrl ? ` for ${c.webhookUrl}` : ""}. It was not created from here, so it cannot be checked against Stripe.` });
      }
    } catch (err) {
      checks.push({ label: "Webhook", ok: false, detail: explainStripe(err) });
    }
  }

  const ok = checks.every((c2) => c2.ok);
  await supabaseAdmin().from("stripe_config").update({
    status: ok ? "ok" : "failed",
    last_error: ok ? null : checks.find((c2) => !c2.ok)?.detail.slice(0, 500) ?? null,
    last_checked_at: new Date().toISOString(),
  }).eq("id", 1);
  clearStripeCache();

  return NextResponse.json({ checks, ok, ...(await state(req)) });
}

/** The actions that save an admin a trip to the Stripe dashboard. */
export async function PATCH(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const action = str(b.action, 40);
  const c = await stripeConfig(true);
  if (!c.secretKey) return NextResponse.json({ error: "Add a secret key first." }, { status: 400 });
  const client = clientFor(c.secretKey);

  try {
    if (action === "prices") {
      // Only recurring prices: this is a subscription, and offering a one-off
      // price here would produce a checkout that fails at the last step.
      const list = await client.prices.list({ active: true, type: "recurring", limit: 50, expand: ["data.product"] });
      return NextResponse.json({
        prices: list.data.map((p) => {
          const product = p.product as { name?: string; active?: boolean } | string;
          return {
            id: p.id,
            label: typeof product === "string" ? product : product?.name ?? "Unnamed product",
            amount: money(p.unit_amount, p.currency),
            interval: p.recurring?.interval ?? "",
          };
        }),
      });
    }

    if (action === "create-price") {
      const name = str(b.name, 80) || "Premium";
      const currency = (str(b.currency, 3) || "usd").toLowerCase();
      const interval = str(b.interval, 10) === "year" ? "year" : "month";
      const amount = Math.round(Number(b.amount) * 100);
      if (!Number.isFinite(amount) || amount < 50)
        return NextResponse.json({ error: "Enter a price of at least 0.50." }, { status: 400 });

      const price = await client.prices.create({
        currency,
        unit_amount: amount,
        recurring: { interval },
        product_data: { name },
      });

      await supabaseAdmin().from("stripe_config").update({ price_id: price.id }).eq("id", 1);
      clearStripeCache();
      await logAdmin(gate.admin, "stripe.price.create", price.id, { name, amount: b.amount, currency, interval });
      // The spread goes last: it carries the freshly saved priceId, and putting
      // it first would have let a stale value overwrite the new one.
      return NextResponse.json({ ok: true, ...(await state(req)) });
    }

    if (action === "create-webhook") {
      const url = webhookUrlFor(req);
      if (!/^https:\/\//.test(url))
        return NextResponse.json({
          error: `Stripe will not send webhooks to ${url}. Set NEXT_PUBLIC_APP_URL to the site's https address and redeploy.`,
        }, { status: 400 });

      // Stripe reveals a signing secret only when the endpoint is created, so an
      // endpoint already pointing here has a secret nobody can recover. Replacing
      // it is also what stops two endpoints double-delivering every event.
      let replaced = 0;
      const existing = await client.webhookEndpoints.list({ limit: 100 });
      for (const ep of existing.data) {
        if (ep.url === url) {
          await client.webhookEndpoints.del(ep.id);
          replaced++;
        }
      }

      const created = await client.webhookEndpoints.create({
        url,
        enabled_events: [...EVENTS],
        description: "Eluna Mind — subscription events",
      });

      if (!created.secret)
        return NextResponse.json({ error: "Stripe created the endpoint but returned no signing secret. Copy it from the Stripe dashboard and paste it below." }, { status: 502 });

      const { error } = await supabaseAdmin().from("stripe_config").update({
        webhook_secret: created.secret,
        webhook_endpoint_id: created.id,
        webhook_url: url,
      }).eq("id", 1);
      if (error) return NextResponse.json({ error: "The endpoint was created but could not be saved. Try again." }, { status: 500 });

      clearStripeCache();
      await logAdmin(gate.admin, "stripe.webhook.create", created.id, { url, replaced });
      return NextResponse.json({ ok: true, url, replaced, ...(await state(req)) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error(`stripe ${action} failed:`, explainStripe(err));
    return NextResponse.json({ error: explainStripe(err) }, { status: 502 });
  }
}

/** Clear everything, which drops the site back to demo or off. */
export async function DELETE(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  await supabaseAdmin().from("stripe_config").update({
    secret_key: "", publishable_key: "", price_id: "",
    webhook_secret: "", webhook_endpoint_id: "", webhook_url: "",
    status: "unknown", last_error: null, account_name: "",
  }).eq("id", 1);

  clearStripeCache();
  await logAdmin(gate.admin, "stripe.config.clear", "payments");
  return NextResponse.json({ ok: true, ...(await state(req)) });
}

/** Stripe stores money in the smallest unit; zero-decimal currencies do not. */
function money(amount: number | null, currency: string): string {
  if (amount === null) return "";
  const zeroDecimal = ["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"];
  const value = zeroDecimal.includes(currency) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).format(value);
  } catch {
    return `${value} ${currency.toUpperCase()}`;
  }
}
