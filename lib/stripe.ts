import Stripe from "stripe";
import { supabaseAdmin } from "./supabase/admin";
import { loadPlans, purchasablePlans } from "./tiers";

/**
 * Stripe configuration.
 *
 * The keys live in the database (`stripe_config`) and fall back to the
 * environment variables, for the same reasons as the AI keys: swapping a test
 * key for a live one should be a save rather than a redeploy, and the person who
 * owns the Stripe account is often not the person who owns the hosting.
 *
 * The consequence worth stating plainly: **the moment a usable key and price are
 * saved, real checkout is live.** There is no second switch to remember, because
 * a second switch is exactly how a site ends up either taking money it should not
 * or refusing money it should. `ready()` below is the single place that decides.
 */

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  priceId: string;
  webhookSecret: string;
  webhookEndpointId: string;
  webhookUrl: string;
  enabled: boolean;
  /** Where these values came from, which the admin page reports. */
  source: "admin" | "env" | "none";
  accountName: string;
};

const EMPTY: StripeConfig = {
  secretKey: "", publishableKey: "", priceId: "", webhookSecret: "",
  webhookEndpointId: "", webhookUrl: "", enabled: true, source: "none", accountName: "",
};

// Short, because a key saved in the admin panel should work on the next click,
// not thirty seconds later.
const CACHE_MS = 10_000;
let cache: { at: number; value: StripeConfig } | null = null;

export function clearStripeCache() { cache = null; }

function fromEnv(): StripeConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return {
    ...EMPTY,
    secretKey,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "",
    priceId: process.env.STRIPE_PRICE_ID?.trim() ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    source: secretKey ? "env" : "none",
  };
}

export async function stripeConfig(force = false): Promise<StripeConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value = fromEnv();
  try {
    const { data, error } = await supabaseAdmin()
      .from("stripe_config")
      .select("secret_key,publishable_key,price_id,webhook_secret,webhook_endpoint_id,webhook_url,enabled,account_name")
      .eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);

    if (data?.enabled && (data.secret_key as string)?.trim()) {
      value = {
        secretKey: (data.secret_key as string).trim(),
        publishableKey: ((data.publishable_key as string) || "").trim(),
        priceId: ((data.price_id as string) || "").trim(),
        webhookSecret: ((data.webhook_secret as string) || "").trim(),
        webhookEndpointId: ((data.webhook_endpoint_id as string) || "").trim(),
        webhookUrl: ((data.webhook_url as string) || "").trim(),
        enabled: true,
        source: "admin",
        accountName: ((data.account_name as string) || "").trim(),
      };
    } else if (data && !data.enabled) {
      // Switched off deliberately: do not quietly fall back to a live env key.
      value = { ...EMPTY, enabled: false, source: "none" };
    }
  } catch (err) {
    // Migration 012 may not have run, or the database may be briefly down. The
    // environment variables still have to be able to carry payments.
    console.error("stripe config unavailable, using environment:", (err as Error)?.message);
  }

  cache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------------------------ */

/** A key's mode, read from the key itself rather than stored separately. */
export function keyMode(key: string): "live" | "test" | "unknown" {
  const k = (key ?? "").trim();
  if (/^(?:sk|rk|pk)_live_/.test(k)) return "live";
  if (/^(?:sk|rk|pk)_test_/.test(k)) return "test";
  return "unknown";
}

/** Enough to recognise which key this is, not enough to use it. */
export function maskKey(key: string): string {
  const k = (key ?? "").trim();
  if (!k) return "";
  if (k.length < 14) return "••••";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/**
 * Is everything needed to take a real payment actually present?
 *
 * A secret key alone is not enough. Without a price there is nothing to sell,
 * and without the webhook secret a customer can pay and never be upgraded —
 * which is the worst failure this app has, so it is treated as not ready rather
 * than as a warning to be clicked past.
 */
export function readiness(c: StripeConfig, planPrices = 0) {
  const problems: string[] = [];
  if (!c.secretKey) problems.push("No Stripe secret key.");
  else if (keyMode(c.secretKey) === "unknown") problems.push("That does not look like a Stripe secret key — it should start with sk_test_ or sk_live_.");
  /*
   * Something has to be for sale, but it no longer has to be *this* price.
   *
   * Each plan carries its own Stripe price now, so an owner who set up three
   * plans properly and left this field empty is ready to take money. Requiring
   * the old single price as well would have switched their checkout off.
   */
  if (!c.priceId && planPrices === 0) problems.push("No price chosen, so there is nothing to sell.");
  if (c.secretKey && !c.webhookSecret)
    problems.push("No webhook signing secret. Without it a customer can pay and never be upgraded.");

  return {
    ready: problems.length === 0 && c.enabled,
    problems,
    mode: keyMode(c.secretKey),
  };
}

/** readiness() with the plans loaded for it, which is what every caller wants. */
export async function paymentsReadiness(force = false) {
  const c = await stripeConfig(force);
  return readiness(c, purchasablePlans(await loadPlans()).length);
}

/** Whether real checkout should run, or the demo flow should stand in for it. */
export async function checkoutMode(): Promise<"live" | "demo" | "off"> {
  if ((await paymentsReadiness()).ready) return "live";
  // Demo checkout is an explicit opt-in: it grants Premium without payment, so
  // it must never be what an unconfigured production site falls into by accident.
  if (process.env.DEMO_CHECKOUT === "1") return "demo";
  return "off";
}

/* ------------------------------------------------------------------ */

const API_VERSION = "2024-06-20" as any;

let client: { key: string; value: Stripe } | null = null;

/**
 * The Stripe client for whichever key is configured.
 *
 * Cached on the key itself, so saving a new key in the admin panel swaps the
 * client rather than leaving a stale one holding the old account.
 */
export async function stripe(): Promise<Stripe> {
  const { secretKey } = await stripeConfig();
  if (!secretKey) throw new StripeNotConfiguredError();
  if (client?.key !== secretKey) client = { key: secretKey, value: clientFor(secretKey) };
  return client.value;
}

/** A client for a key that has not been saved yet, used by the Test button. */
export function clientFor(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: API_VERSION,
    // A checkout session that hangs is a customer staring at a dead button.
    timeout: 20_000,
    maxNetworkRetries: 1,
    // Points the SDK at a local stub instead of Stripe. Only ever set in tests —
    // unset, which is the normal case, the SDK talks to api.stripe.com as usual.
    ...stubTarget(),
  });
}

function stubTarget() {
  const host = process.env.STRIPE_API_HOST?.trim();
  if (!host) return {};
  console.warn(`Stripe calls are going to ${host} instead of Stripe. This is a test setting.`);
  return {
    host,
    port: Number(process.env.STRIPE_API_PORT || 443),
    protocol: (process.env.STRIPE_API_PROTOCOL as "http" | "https") || "https",
  };
}

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Payments are not set up yet. An admin needs to add a Stripe key under Admin → Payments.");
  }
}

/** Turn a Stripe error into something an admin can act on. */
export function explainStripe(err: unknown): string {
  const e = err as { type?: string; code?: string; message?: string; statusCode?: number; raw?: { message?: string } };
  const message = e?.raw?.message || e?.message || String(err);

  if (e?.type === "StripeAuthenticationError" || e?.statusCode === 401)
    return "Stripe rejected the key. Check it was copied in full and has not been rolled.";
  if (e?.code === "resource_missing")
    return `Stripe could not find that: ${message}. A test-mode price cannot be used with a live key, or the other way round.`;
  if (e?.type === "StripePermissionError")
    return "That key does not have permission for this. A restricted key needs write access to Checkout, Prices and Webhooks.";
  if (e?.type === "StripeConnectionError")
    return "Could not reach Stripe. Try again in a moment.";
  if (e?.type === "StripeRateLimitError")
    return "Too many requests to Stripe at once. Wait a few seconds and try again.";
  return message.slice(0, 300);
}
