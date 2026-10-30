import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser, touchLastSeen } from "../../lib/auth";
import { getUsageToday } from "../../lib/usage";
import { buildUsageSummary } from "../../lib/plans";
import { getSettings } from "../../lib/settings";
import { loadPlans, planFor, purchasablePlans } from "../../lib/tiers";
import { ErrorBoundary } from "../_components/ErrorCatcher";
import { UsageProvider } from "../_components/UsageProvider";
import { Shell } from "./Shell";
import { AuthEvent } from "../_components/AuthEvent";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard — Eluna Mind", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  if (!auth) redirect("/login?next=/dashboard");
  if (auth.blocked) redirect("/suspended");
  const [counts, settings, plans] = await Promise.all([getUsageToday(auth.user.id), getSettings(), loadPlans()]);
  void touchLastSeen(auth.user.id); // fire-and-forget "last seen" stamp
  return (
    <UsageProvider initial={{
      plan: auth.plan,
      planName: auth.planName,
      paid: auth.paid,
      buyable: purchasablePlans(plans).map((p) => ({ slug: p.slug, name: p.name })),
      email: auth.user.email ?? "",
      usage: buildUsageSummary(counts, planFor(plans, auth.plan).limits),
      role: auth.role,
      onTrial: auth.onTrial,
      trialEndsAt: auth.trialEndsAt,
      trialEligible: settings.flags.trialEnabled && !auth.trialUsed && !auth.subscribed,
      trialRequiresCard: settings.flags.trialRequiresCard,
      trialDays: settings.flags.trialDays,
      supportEnabled: settings.flags.supportEnabled,
    }}>
      {/* Reports a Google sign-in once, then strips the marker from the URL. */}
      <AuthEvent />
      <Shell><ErrorBoundary label="dashboard">{children}</ErrorBoundary></Shell>
    </UsageProvider>
  );
}
