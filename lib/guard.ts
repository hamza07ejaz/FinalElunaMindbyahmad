import { NextResponse } from "next/server";
import { requireUser, type AuthResult } from "./auth";
import { getSettings } from "./settings";
import type { Feature, Rule } from "./plans";
import { allowance, loadPlans, planFor, upgradeExists, type PlanRow } from "./tiers";
import { consumeUsage, refundUsage } from "./usage";

export type GuardOk = {
  ok: true;
  auth: AuthResult;
  rule: Rule;
  /** The plan this person is on, resolved from the plans table. */
  plan: PlanRow;
  /** Call AFTER validating input. Returns a response if the daily limit is hit, otherwise null. */
  consume: () => Promise<NextResponse | null>;
  /** Call if the AI request fails, so the user does not lose a use. */
  refund: () => Promise<void>;
};
export type GuardFail = { ok: false; res: NextResponse };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): GuardFail => ({
  ok: false,
  res: NextResponse.json({ error, ...extra }, { status }),
});

// Step 1 of every AI route: kill switch -> login -> not blocked -> plan gate.
// Limits come from the admin settings (database), falling back to the defaults in plans.ts.
export async function guard(req: Request, feature: Feature): Promise<GuardOk | GuardFail> {
  const settings = await getSettings();

  if (process.env.AI_DISABLED === "1" || settings.flags.aiDisabled)
    return fail(503, "AI features are paused right now. Please try again later.");

  const auth = await requireUser(req);
  if (!auth) return fail(401, "Please log in to use this feature.");
  if (auth.blocked)
    return fail(403, auth.blockedReason?.trim() || "This account has been suspended. Contact support if you think this is a mistake.");

  const rule = settings.rules[feature];

  /*
   * What this tool costs is now a property of the plan, not of the code.
   *
   * There used to be a premiumOnly flag and a pair of per-tool numbers, which
   * meant the two tiers were part of the shape of every limit. A tool is
   * simply absent from a plan's allowance now, which says the same thing once
   * instead of twice and leaves room for a third tier.
   */
  const plans = await loadPlans();
  const plan = planFor(plans, auth.plan);
  const limit = allowance(plan, feature);

  if (limit <= 0) {
    // Only offer an upgrade when one actually exists. Telling somebody on the
    // top plan to upgrade is worse than telling them nothing.
    const canUpgrade = upgradeExists(plans, plan, feature);
    return fail(
      403,
      canUpgrade
        ? `${rule.label} is not included in ${plan.name}.`
        : `${rule.label} is not available right now.`,
      { upgrade: canUpgrade },
    );
  }

  return {
    ok: true,
    auth,
    rule,
    plan,
    consume: async () => {
      const result = await consumeUsage(auth.user.id, feature, limit);
      if (result === "ok") return null;
      if (result === "error")
        return NextResponse.json(
          { error: "We could not check your daily allowance just now. Please try again in a moment." },
          { status: 503 }
        );
      // Out of allowance. Whether that is a wall or an invitation depends on
      // whether a plan above this one gives more of the same tool.
      const better = upgradeExists(plans, plan, feature);
      return better
        ? NextResponse.json(
            { error: `You have used today's ${rule.label} on ${plan.name}. A higher plan gives you more.`, upgrade: true },
            { status: 403 },
          )
        : NextResponse.json(
            { error: `Daily limit for ${rule.label} reached. It resets tomorrow.` },
            { status: 429 },
          );
    },
    refund: () => refundUsage(auth.user.id, feature),
  };
}
