import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { getUsageToday } from "../../../lib/usage";
import { buildUsageSummary } from "../../../lib/plans";
import { getSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const [counts, settings] = await Promise.all([getUsageToday(auth.user.id), getSettings()]);
  return NextResponse.json({
    plan: auth.plan,
    email: auth.user.email ?? "",
    usage: buildUsageSummary(auth.plan, counts, settings.rules),
    role: auth.role,
    onTrial: auth.onTrial,
    trialEndsAt: auth.trialEndsAt,
    // "eligible" means a trial is still available to this account. Whether it
    // needs a card decides which button the UI shows, so both travel together.
    trialEligible:
      settings.flags.trialEnabled && !auth.trialUsed && auth.paidPlan !== "premium" && !auth.blocked,
    trialRequiresCard: settings.flags.trialRequiresCard,
    trialDays: settings.flags.trialDays,
    supportEnabled: settings.flags.supportEnabled,
  });
}
