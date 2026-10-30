"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import { useUsageOptional } from "./UsageProvider";
import { analytics } from "../../lib/analytics";

/**
 * Starts checkout for one plan.
 *
 * The slug is sent, never a price: the server looks the price up from the
 * plan, so a changed price in Stripe or a tampered request cannot buy the
 * wrong tier. With no slug the server falls back to the cheapest paid plan,
 * which is what this did when there was only one.
 */
export function useUpgrade(plan?: string) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const start = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan ?? "" }),
      });
      if (r.status === 401) { window.location.href = "/login?next=/pricing"; return; }
      const j = await r.json();
      if (r.ok && j.url) {
        // Pushed before the redirect, while this page still exists. The tag
        // manager reads the data layer synchronously, so there is no race.
        analytics.beginCheckout(Number(j.value) || 0, String(j.currency || "USD"), String(j.plan || ""));
        window.location.href = j.url;
        return;
      }
      setErr(j.error || "Could not start checkout.");
    } catch { setErr("Network error. Please try again."); }
    setBusy(false);
  };
  return { start, busy, err };
}

/** Days remaining on a trial, rounded up so the last partial day still counts. */
export function trialDaysLeft(endsAt?: string | null) {
  if (!endsAt) return 0;
  const ms = new Date(endsAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function useTrial() {
  // On the public pricing page there is no provider, so there is nothing to refresh.
  const ctx = useUsageOptional();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const start = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/trial", { method: "POST" });
      if (r.status === 401) { window.location.href = "/login?next=/dashboard"; return; }
      const j = await r.json().catch(() => ({}));
      if (r.ok) { await ctx?.refresh(); return; }
      setErr(j.error || "Could not start your trial.");
    } catch { setErr("Network error. Please try again."); }
    setBusy(false);
  };
  return { start, busy, err };
}

/**
 * The money button.
 *
 * What it does depends on how many plans are for sale, which is the whole
 * point of plans being data: with one it opens checkout, with several it sends
 * people to the pricing page rather than silently picking a tier for them, and
 * with none it renders nothing at all instead of a button that 503s.
 *
 * Where a no-card trial is still available it offers that instead of checkout:
 * asking someone to pay before they have seen the paid tools is the worse of
 * the two conversations.
 */
export function UpgradeButton({
  label,
  className = "btn btn-primary",
  plan,
}: { label?: string; className?: string; plan?: string }) {
  const ctx = useUsageOptional();
  const trialEligible = ctx?.trialEligible ?? false;
  const requiresCard = ctx?.trialRequiresCard ?? true;
  const trialDays = ctx?.trialDays ?? 7;
  // On the public pricing page there is no provider; the cards pass the plan in.
  const buyable = ctx?.buyable;
  const only = plan ?? (buyable?.length === 1 ? buyable[0].slug : undefined);
  const checkout = useUpgrade(only);
  const trial = useTrial();

  // Nothing is for sale: no button. Said here once rather than in every caller.
  if (buyable && buyable.length === 0 && !plan) return null;

  const text = label ?? (only && buyable?.find((b) => b.slug === only)?.name
    ? `Get ${buyable.find((b) => b.slug === only)!.name}`
    : "See the plans");

  // A card-backed trial IS checkout — Stripe applies the trial days to the
  // subscription — so the button opens checkout but says what actually happens.
  if (trialEligible && requiresCard && only) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button type="button" className={className} onClick={checkout.start} disabled={checkout.busy}>
          {checkout.busy
            ? <><span className="spinner" /> Opening checkout…</>
            : <><Icon name="zap" size={16} /> Start your {trialDays}-day free trial</>}
        </button>
        <span className="text-xs text-muted">
          Nothing is charged today. Cancel any time in the first {trialDays} days and you pay nothing.
        </span>
        {checkout.err && <span className="text-xs text-red-300">{checkout.err}</span>}
      </span>
    );
  }

  if (trialEligible && !requiresCard) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button type="button" className={className} onClick={trial.start} disabled={trial.busy}>
          {trial.busy
            ? <><span className="spinner" /> Starting…</>
            : <><Icon name="zap" size={16} /> Try the paid tools free for {trialDays} days</>}
        </button>
        <span className="text-xs text-muted">No card needed. Nothing charges automatically.</span>
        {trial.err && <span className="text-xs text-red-300">{trial.err}</span>}
      </span>
    );
  }

  /*
   * Several plans and no particular one asked for: the honest action is to let
   * them choose, not to start checkout for whichever happens to be cheapest.
   */
  if (!only) {
    return (
      <Link href="/pricing" className={className}>
        <Icon name="zap" size={16} /> {label ?? "See the plans"}
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={checkout.start} disabled={checkout.busy}>
        {checkout.busy ? <><span className="spinner" /> Opening checkout…</> : <><Icon name="zap" size={16} /> {text}</>}
      </button>
      {checkout.err && <span className="text-xs text-red-300">{checkout.err}</span>}
    </span>
  );
}

/** The trial countdown, shown wherever the plan is shown. */
export function TrialBadge() {
  const ctx = useUsageOptional();
  const onTrial = ctx?.onTrial, trialEndsAt = ctx?.trialEndsAt;
  if (!onTrial || !trialEndsAt) return null;
  const left = trialDaysLeft(trialEndsAt);
  const urgent = left <= 2;
  return (
    <span className={`chip ${urgent ? "chip-brand" : "chip-ok"}`} title={`Trial ends ${new Date(trialEndsAt).toLocaleDateString()}`}>
      <Icon name="zap" size={12} />
      {left === 0 ? "Trial ends today" : `${left} day${left === 1 ? "" : "s"} of ${ctx?.planName || "the paid plan"} left`}
    </span>
  );
}
