import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireUser, touchLastSeen } from "../../lib/auth";
import { getUsageToday } from "../../lib/usage";
import { buildUsageSummary } from "../../lib/plans";
import { getSettings } from "../../lib/settings";
import { ErrorBoundary } from "../_components/ErrorCatcher";
import { UsageProvider } from "../_components/UsageProvider";
import { Shell } from "./Shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard — Eluna Mind", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireUser();
  if (!auth) redirect("/login?next=/dashboard");
  if (auth.blocked) redirect("/suspended");
  const [counts, settings] = await Promise.all([getUsageToday(auth.user.id), getSettings()]);
  void touchLastSeen(auth.user.id); // fire-and-forget "last seen" stamp
  return (
    <UsageProvider initial={{
      plan: auth.plan,
      email: auth.user.email ?? "",
      usage: buildUsageSummary(auth.plan, counts, settings.rules),
      role: auth.role,
      onTrial: auth.onTrial,
      trialEndsAt: auth.trialEndsAt,
      trialEligible: settings.flags.trialEnabled && !auth.trialUsed && auth.paidPlan !== "premium",
      trialRequiresCard: settings.flags.trialRequiresCard,
      trialDays: settings.flags.trialDays,
      supportEnabled: settings.flags.supportEnabled,
    }}>
      <Shell><ErrorBoundary label="dashboard">{children}</ErrorBoundary></Shell>
    </UsageProvider>
  );
}
