import { supabaseAdmin } from "./supabase/admin";
import { DEFAULT_RULES, FEATURES, type Feature } from "./plans";

/**
 * The plans an owner has configured.
 *
 * These used to be two words in a type — 'free' | 'premium' — with each
 * tool's allowance stored as a pair of numbers, one for each. That shape made
 * a third tier a code change in sixteen files rather than a row in a table.
 *
 * Now a plan is data: what it costs, what it says, which Stripe price buys it,
 * and how many of each tool it allows a day. The guard asks this module what
 * the signed-in person's plan permits, and nothing anywhere branches on the
 * word "premium" any more.
 */

export type PlanRow = {
  slug: string;
  name: string;
  blurb: string;
  priceLabel: string;
  periodLabel: string;
  stripePriceId: string;
  features: string[];
  /** tool -> uses per day. Absent or 0 means the tool is not in this plan. */
  limits: Record<string, number>;
  isDefault: boolean;
  sort: number;
  enabled: boolean;
};

/**
 * What the app falls back to when the table cannot be read.
 *
 * Built from the limits that were in the code before, so a database outage or
 * a migration that has not been run yet leaves the app behaving exactly as it
 * did rather than locking everyone out of everything.
 */
function builtIn(): PlanRow[] {
  const free: Record<string, number> = {};
  const paid: Record<string, number> = {};
  for (const f of FEATURES) {
    const r = DEFAULT_RULES[f];
    free[f] = r.premiumOnly ? 0 : r.freePerDay;
    paid[f] = r.premiumPerDay;
  }
  return [
    { slug: "free", name: "Free", blurb: "", priceLabel: "Free", periodLabel: "forever",
      stripePriceId: "", features: [], limits: free, isDefault: true, sort: 0, enabled: true },
    { slug: "premium", name: "Premium", blurb: "", priceLabel: "", periodLabel: "",
      stripePriceId: "", features: [], limits: paid, isDefault: false, sort: 1, enabled: true },
  ];
}

const CACHE_MS = 10_000;
let cache: { at: number; value: PlanRow[] } | null = null;

export function clearPlanCache() { cache = null; }

const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : 0;
};

export async function loadPlans(force = false): Promise<PlanRow[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value = builtIn();
  try {
    const { data, error } = await supabaseAdmin()
      .from("plans")
      .select("slug,name,blurb,price_label,period_label,stripe_price_id,features,limits,is_default,sort,enabled")
      .order("sort");

    if (error) throw new Error(error.message);
    if (data && data.length) {
      value = data.map((r) => {
        const raw = (r.limits ?? {}) as Record<string, unknown>;
        const limits: Record<string, number> = {};
        // Only tools the app actually has. A stale key left behind by a
        // renamed tool should not look like an allowance for something.
        for (const f of FEATURES) limits[f] = num(raw[f]);
        return {
          slug: String(r.slug),
          name: String(r.name || r.slug),
          blurb: String(r.blurb ?? ""),
          priceLabel: String(r.price_label ?? ""),
          periodLabel: String(r.period_label ?? ""),
          stripePriceId: String(r.stripe_price_id ?? ""),
          features: Array.isArray(r.features) ? (r.features as unknown[]).map(String).filter(Boolean).slice(0, 20) : [],
          limits,
          isDefault: !!r.is_default,
          sort: Number(r.sort) || 0,
          enabled: r.enabled !== false,
        };
      });
    }
  } catch (err) {
    // Including a missing table, which is what a half-run migration looks
    // like. The built-in plans keep the app working meanwhile.
    console.error("plans unavailable, using the built-in tiers:", (err as Error)?.message);
  }

  cache = { at: Date.now(), value };
  return value;
}

/** The plan a new account gets, and the one a cancelled subscription returns to. */
export function defaultPlan(plans: PlanRow[]): PlanRow {
  return plans.find((p) => p.isDefault) ?? plans[0];
}

/**
 * The plan a person is on.
 *
 * An account whose plan was deleted, or renamed, falls back to the default
 * rather than to nothing: losing a tier should cost someone their extras, not
 * their account.
 */
export function planFor(plans: PlanRow[], slug: string | null | undefined): PlanRow {
  return plans.find((p) => p.slug === slug) ?? defaultPlan(plans);
}

/**
 * Whether this plan is one somebody pays for.
 *
 * Everything that used to ask `plan === "premium"` was really asking this: is
 * this person on the free plan or not. The default plan is the free one by
 * definition, so anything else is a paid tier — including one whose Stripe
 * price has not been filled in yet, which is a plan an owner is mid-way
 * through setting up rather than a free one.
 */
export function isPaidPlan(plans: PlanRow[], plan: PlanRow): boolean {
  return plan.slug !== defaultPlan(plans).slug;
}

/** Every plan that can actually be bought, cheapest first by the owner's order. */
export function purchasablePlans(plans: PlanRow[]): PlanRow[] {
  return visiblePlans(plans).filter((p) => !p.isDefault && !!p.stripePriceId);
}

/**
 * The plan a free trial hands out.
 *
 * The entry-level paid tier, not the top one: a trial exists to show what
 * paying is like, and giving away the most expensive plan for a week is a
 * decision an owner should make deliberately rather than inherit. Which plan
 * that is follows the order set in the admin panel, so it is changeable
 * without touching this.
 *
 * Falls back to any non-free plan when no Stripe price is saved yet, so trials
 * still work on a site that is not taking payments.
 */
export function trialPlan(plans: PlanRow[]): PlanRow | null {
  const paid = purchasablePlans(plans);
  if (paid.length) return paid[0];
  return visiblePlans(plans).find((p) => !p.isDefault) ?? null;
}

/** How many of a tool this plan allows a day. 0 means it is not included. */
export function allowance(plan: PlanRow, feature: Feature): number {
  return plan.limits[feature] ?? 0;
}

/**
 * Whether any purchasable plan offers more of this tool than the one given.
 *
 * This is what decides whether a refusal says "upgrade" or just "no". Telling
 * someone on the top tier to upgrade is the kind of thing that gets a support
 * ticket, and telling someone on the free plan nothing at all loses a sale.
 */
export function upgradeExists(plans: PlanRow[], current: PlanRow, feature: Feature): boolean {
  return plans.some(
    (p) => p.enabled && p.slug !== current.slug && !!p.stripePriceId && allowance(p, feature) > allowance(current, feature),
  );
}

/** The plans to show on the pricing page, in the order an owner set. */
export function visiblePlans(plans: PlanRow[]): PlanRow[] {
  return plans.filter((p) => p.enabled).sort((a, b) => a.sort - b.sort);
}

/** Which plan a paid Stripe price belongs to, for the webhook. */
export function planForPrice(plans: PlanRow[], priceId: string): PlanRow | null {
  if (!priceId) return null;
  return plans.find((p) => p.stripePriceId === priceId) ?? null;
}
