import { NextResponse } from "next/server";
import { requireUser, type AuthResult } from "./auth";
import { getSettings } from "./settings";
import type { Feature, Rule } from "./plans";
import { consumeUsage, refundUsage } from "./usage";

export type GuardOk = {
  ok: true;
  auth: AuthResult;
  rule: Rule;
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
  const premium = auth.plan === "premium";
  if (rule.premiumOnly && !premium)
    return fail(403, `${rule.label} is available for Premium users only.`, { upgrade: true });

  const limit = premium ? rule.premiumPerDay : rule.freePerDay;
  if (limit <= 0)
    return fail(403, `${rule.label} is not available on your plan right now.`, { upgrade: !premium });

  return {
    ok: true,
    auth,
    rule,
    consume: async () => {
      const result = await consumeUsage(auth.user.id, feature, limit);
      if (result === "ok") return null;
      if (result === "error")
        return NextResponse.json(
          { error: "We could not check your daily allowance just now. Please try again in a moment." },
          { status: 503 }
        );
      return premium
        ? NextResponse.json({ error: "Daily fair-use limit reached. Please try again tomorrow." }, { status: 429 })
        : NextResponse.json(
            { error: `You've used your free daily limit for ${rule.label}. Upgrade to Premium for more.`, upgrade: true },
            { status: 403 }
          );
    },
    refund: () => refundUsage(auth.user.id, feature),
  };
}
