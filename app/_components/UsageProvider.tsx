"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Plan, UsageSummary } from "../../lib/plans";

type State = {
  plan: Plan;                 // premium while a trial is running
  email: string;
  usage: UsageSummary;
  role?: "user" | "sub_admin" | "admin";
  onTrial?: boolean;
  trialEndsAt?: string | null;
  /** True when a no-card trial is still on offer, so the UI can say so instead of asking for money. */
  trialEligible?: boolean;
  /** true = the trial runs through Stripe with a card; false = no card at all. */
  trialRequiresCard?: boolean;
  trialDays?: number;
  supportEnabled?: boolean;
};
type Ctx = State & { refresh: () => Promise<void> };

const C = createContext<Ctx | null>(null);

export function UsageProvider({ initial, children }: { initial: State; children: ReactNode }) {
  const [s, setS] = useState<State>(initial);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/usage", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setS({
          plan: j.plan, email: j.email ?? "", usage: j.usage, role: j.role,
          onTrial: j.onTrial, trialEndsAt: j.trialEndsAt, trialEligible: j.trialEligible,
          trialRequiresCard: j.trialRequiresCard, trialDays: j.trialDays,
          supportEnabled: j.supportEnabled,
        });
      }
    } catch { /* keep the old numbers */ }
  }, []);
  return <C.Provider value={{ ...s, refresh }}>{children}</C.Provider>;
}

export function useUsage() {
  const c = useContext(C);
  if (!c) throw new Error("useUsage must be used inside UsageProvider");
  return c;
}

/**
 * For components that render both inside the dashboard and on the public
 * marketing pages, where there is no logged-in user and so no provider.
 */
export function useUsageOptional() {
  return useContext(C);
}
