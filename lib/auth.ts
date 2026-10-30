import { createSupabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import type { Plan } from "./plans";
import { isPaidPlan, loadPlans, planFor, trialPlan } from "./tiers";
import { can, isStaff, toRole, type Permission, type Role } from "./roles";

// Roles live in their own import-free module so client components can use
// them without pulling this file's server-only dependencies into the bundle.
export { ROLE_LABEL, can, isStaff, permissionsFor, type Permission, type Role } from "./roles";

export type AuthResult = {
  user: { id: string; email?: string };
  /** The slug of the plan to treat them as on right now. A live trial reads as the trial plan. */
  plan: Plan;
  /** What they actually pay for, ignoring any trial. */
  paidPlan: Plan;
  /** That plan's name, for anything shown to the person. Never hardcode "Premium". */
  planName: string;
  /** True on any plan other than the free default — what `plan === "premium"` used to mean. */
  paid: boolean;
  /** True only if they actually pay. `paid` is also true during a trial; this is not. */
  subscribed: boolean;
  onTrial: boolean;
  trialEndsAt: string | null;
  /** True once a trial has ever been started, so it is never offered twice. */
  trialUsed: boolean;
  role: Role;
  blocked: boolean;
  blockedReason?: string;
};

type ProfileRow = {
  plan?: string | null;
  role?: string | null;
  status?: string | null;
  blocked_reason?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
};

const BASE_COLUMNS = "plan,role,status,blocked_reason";
const TRIAL_COLUMNS = `${BASE_COLUMNS},trial_started_at,trial_ends_at`;

/**
 * Migration 007 adds the trial columns. Until it has been run they do not
 * exist, and asking for them would fail the query and log everybody out, so
 * the narrower select is tried as a fallback.
 */
async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const full = await supabaseAdmin().from("profiles").select(TRIAL_COLUMNS).eq("id", userId).maybeSingle();
  if (!full.error) return full.data as ProfileRow | null;

  console.error("profile trial columns unavailable:", full.error.message);
  const basic = await supabaseAdmin().from("profiles").select(BASE_COLUMNS).eq("id", userId).maybeSingle();
  if (basic.error) {
    console.error("profile load failed:", basic.error.message);
    return null;
  }
  return basic.data as ProfileRow | null;
}


// Identifies the caller from the session cookie (or an Authorization: Bearer token),
// then loads their plan, role, trial and blocked state from the database.
export async function requireUser(req?: Request): Promise<AuthResult | null> {
  let user: { id: string; email?: string } | null = null;

  const bearer = req?.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (bearer) {
    const { data, error } = await supabaseAdmin().auth.getUser(bearer);
    if (!error && data.user) user = { id: data.user.id, email: data.user.email };
  } else {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser(); // validated by Supabase, not just decoded
    if (!error && data.user) user = { id: data.user.id, email: data.user.email };
  }
  if (!user) return null;

  const profile = await loadProfile(user.id);

  /*
   * The plan is whatever row the slug points at.
   *
   * It used to be coerced to one of two words here, which meant a third tier
   * saved against an account was silently read back as "free". An unknown slug
   * — a plan an owner deleted, say — still falls back to the free default, but
   * that now happens in one place, planFor(), rather than in this expression.
   */
  const plans = await loadPlans();
  const paidRow = planFor(plans, profile?.plan);
  const trialEndsAt = profile?.trial_ends_at ?? null;

  // A trial is live purely by date, so nothing has to run to expire one. Only
  // somebody on the free plan can be on one: a paying customer is not upgraded
  // or downgraded by a trial that happens to still be in date.
  const trialRow = trialPlan(plans);
  const onTrial =
    !isPaidPlan(plans, paidRow) && !!trialRow && !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();

  const effective = onTrial && trialRow ? trialRow : paidRow;

  return {
    user,
    plan: effective.slug,
    paidPlan: paidRow.slug,
    planName: effective.name,
    paid: isPaidPlan(plans, effective),
    subscribed: isPaidPlan(plans, paidRow),
    onTrial,
    trialEndsAt,
    trialUsed: !!profile?.trial_started_at,
    role: toRole(profile?.role),
    blocked: profile?.status === "blocked",
    blockedReason: profile?.blocked_reason ?? undefined,
  };
}

/** Returns the caller only if they are a full admin. */
export async function requireAdmin(req?: Request): Promise<AuthResult | null> {
  const auth = await requireUser(req);
  if (!auth || auth.role !== "admin" || auth.blocked) return null;
  return auth;
}

/**
 * Returns the caller if they are staff, optionally only when they hold a
 * specific permission. Use this everywhere except where full-admin is the point.
 */
export async function requireStaff(req?: Request, permission?: Permission): Promise<AuthResult | null> {
  const auth = await requireUser(req);
  if (!auth || auth.blocked || !isStaff(auth.role)) return null;
  if (permission && !can(auth, permission)) return null;
  return auth;
}

/** Writes an entry to the admin audit log. Never throws. */
export async function logAdmin(
  actor: AuthResult,
  action: string,
  target?: string,
  detail?: Record<string, unknown>
) {
  try {
    await supabaseAdmin().from("admin_audit").insert({
      actor_id: actor.user.id,
      actor_email: actor.user.email ?? null,
      action,
      target: target ?? null,
      detail: detail ?? null,
    });
  } catch (err) {
    console.error("audit log failed:", err);
  }
}

/** Best-effort "last seen" stamp; failures are ignored. */
export async function touchLastSeen(userId: string) {
  try {
    await supabaseAdmin().from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
  } catch { /* not worth failing a request over */ }
}
