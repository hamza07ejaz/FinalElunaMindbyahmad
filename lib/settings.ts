import { supabaseAdmin } from "./supabase/admin";
import { DEFAULT_RULES, type Feature, type Rule } from "./plans";
import { DEFAULT_SITE, normaliseSite, type SiteContent } from "./content";

/**
 * Settings the admin can change from the panel, without a deploy.
 *
 * Code holds the defaults; a row in `app_settings` overrides them.
 * Reads are cached in memory for a few seconds so a busy page does not
 * hit the database once per request.
 */

export type Branding = {
  siteName: string;
  tagline: string;
  logoUrl: string;      // empty = use the built-in mark
  supportEmail: string;
  heroHeadline: string;
  heroSubline: string;
};

export type Pricing = {
  premiumPrice: string;        // shown on the pricing page, e.g. "$15.99"
  premiumPeriod: string;       // e.g. "per month"
  freeName: string;
  premiumName: string;
  premiumBlurb: string;
  premiumFeatures: string[];   // extra selling points listed under the plan
};

export type Flags = {
  aiDisabled: boolean;         // kill switch, same effect as the AI_DISABLED env var
  signupsOpen: boolean;
  blogEnabled: boolean;
  maintenanceNote: string;     // shown as a banner when not empty
  trialEnabled: boolean;       // offer a Premium trial at all
  trialDays: number;           // how long that trial lasts
  /**
   * true  = the trial runs through Stripe, card on file, converts to paid
   *         unless the user cancels. Standard SaaS, and the higher-converting
   *         of the two.
   * false = no card at all; the trial simply expires and nothing is charged.
   */
  trialRequiresCard: boolean;
  supportEnabled: boolean;     // let users open support tickets in the app
};

export type Settings = {
  rules: Record<Feature, Rule>;
  branding: Branding;
  pricing: Pricing;
  flags: Flags;
  /** Every word on the public site. */
  site: SiteContent;
};

export const DEFAULT_BRANDING: Branding = {
  siteName: "Eluna Mind",
  tagline: "An AI tutor that reads your actual course material — for anyone studying anything.",
  logoUrl: "",
  supportEmail: "support@elunamind.app",
  heroHeadline: "The tutor who is still awake at 1 a.m.",
  heroSubline:
    "Upload the chapter, the slide deck or the lecture recording and get it explained step by step. Turn it into notes, quiz yourself, and plan the week before your exam.",
};

export const DEFAULT_PRICING: Pricing = {
  premiumPrice: "$15.99",
  premiumPeriod: "per month, cancel any time",
  freeName: "Free",
  premiumName: "Premium",
  premiumBlurb: "For exam weeks and heavy study days.",
  premiumFeatures: [],
};

export const DEFAULT_FLAGS: Flags = {
  aiDisabled: false,
  signupsOpen: true,
  blogEnabled: true,
  maintenanceNote: "",
  trialEnabled: true,
  trialDays: 7,
  trialRequiresCard: true,
  supportEnabled: true,
};

export const DEFAULTS: Settings = {
  rules: DEFAULT_RULES,
  branding: DEFAULT_BRANDING,
  pricing: DEFAULT_PRICING,
  flags: DEFAULT_FLAGS,
  site: DEFAULT_SITE,
};

const TTL_MS = 10_000;
let cache: { at: number; value: Settings } | null = null;

/** Merge a stored object over its defaults, keeping only keys the default has. */
function merge<T extends object>(base: T, stored: unknown): T {
  if (!stored || typeof stored !== "object") return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    if (k in out && v !== null && v !== undefined) out[k] = v;
  }
  return out as T;
}

function mergeRules(stored: unknown): Record<Feature, Rule> {
  const out = {} as Record<Feature, Rule>;
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  for (const [key, def] of Object.entries(DEFAULT_RULES) as [Feature, Rule][]) {
    const raw = s[key];
    const r = merge(def, raw);
    // keep the numbers sane whatever was stored
    out[key] = {
      ...r,
      freePerDay: clampInt(r.freePerDay, 0, 100_000, def.freePerDay),
      premiumPerDay: clampInt(r.premiumPerDay, 0, 100_000, def.premiumPerDay),
      maxInputChars: clampInt(r.maxInputChars, 50, 200_000, def.maxInputChars),
      maxTokens: clampInt(r.maxTokens, 50, 16_000, def.maxTokens),
      premiumOnly: typeof r.premiumOnly === "boolean" ? r.premiumOnly : def.premiumOnly,
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 40) : def.label,
    };
  }
  return out;
}

function mergeFlags(stored: unknown): Flags {
  const f = merge(DEFAULT_FLAGS, stored);
  return {
    ...f,
    // The trial length is the only number here, and a 0 or a 9999 would both be
    // a mistake rather than a policy, so it is clamped like every other limit.
    trialDays: clampInt(f.trialDays, 1, 90, DEFAULT_FLAGS.trialDays),
    trialEnabled: typeof f.trialEnabled === "boolean" ? f.trialEnabled : DEFAULT_FLAGS.trialEnabled,
    trialRequiresCard: typeof f.trialRequiresCard === "boolean" ? f.trialRequiresCard : DEFAULT_FLAGS.trialRequiresCard,
    supportEnabled: typeof f.supportEnabled === "boolean" ? f.supportEnabled : DEFAULT_FLAGS.supportEnabled,
  };
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  // Number("") and Number(null) are both 0, which would silently turn an empty
  // field into a real limit. Only accept a number or a non-empty numeric string.
  if (typeof v !== "number" && typeof v !== "string") return fallback;
  if (typeof v === "string" && v.trim() === "") return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Everything the app needs, defaults merged with whatever the admin saved. */
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let value: Settings = DEFAULTS;
  try {
    const { data, error } = await supabaseAdmin().from("app_settings").select("key,value");
    if (error) throw new Error(error.message);
    const byKey = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value]));
    value = {
      rules: mergeRules(byKey.rules),
      branding: merge(DEFAULT_BRANDING, byKey.branding),
      pricing: merge(DEFAULT_PRICING, byKey.pricing),
      flags: mergeFlags(byKey.flags),
      site: normaliseSite(byKey.site),
    };
  } catch (err) {
    // Never take the site down because settings could not be read.
    console.error("getSettings fell back to defaults:", err);
  }

  cache = { at: Date.now(), value };
  return value;
}

/** Call after any admin write so the next read is fresh. */
export function clearSettingsCache() {
  cache = null;
}

export async function saveSetting(key: keyof Settings, value: unknown, actorId?: string) {
  const { error } = await supabaseAdmin()
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: actorId ?? null });
  if (error) throw new Error(error.message);
  clearSettingsCache();
}
