import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { getUsageToday } from "../../../lib/usage";
import { buildUsageSummary } from "../../../lib/plans";
import { getSettings } from "../../../lib/settings";
import { loadPlans, planFor, purchasablePlans } from "../../../lib/tiers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const [counts, settings, plans] = await Promise.all([getUsageToday(auth.user.id), getSettings(), loadPlans()]);
  return NextResponse.json({
    plan: auth.plan,
    planName: auth.planName,
    paid: auth.paid,
    buyable: purchasablePlans(plans).map((p) => ({ slug: p.slug, name: p.name })),
    email: auth.user.email ?? "",
    usage: buildUsageSummary(counts, planFor(plans, auth.plan).limits),
    role: auth.role,
    onTrial: auth.onTrial,
    trialEndsAt: auth.trialEndsAt,
    // "eligible" means a trial is still available to this account. Whether it
    // needs a card decides which button the UI shows, so both travel together.
    trialEligible:
      settings.flags.trialEnabled && !auth.trialUsed && !auth.subscribed && !auth.blocked,
    trialRequiresCard: settings.flags.trialRequiresCard,
    trialDays: settings.flags.trialDays,
    supportEnabled: settings.flags.supportEnabled,
  });
}
