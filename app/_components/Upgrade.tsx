"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { useUsageOptional } from "./UsageProvider";

export function useUpgrade() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const start = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/create-checkout-session", { method: "POST" });
      if (r.status === 401) { window.location.href = "/login?next=/pricing"; return; }
      const j = await r.json();
      if (r.ok && j.url) { window.location.href = j.url; return; }
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
 * The money button. Where a no-card trial is still available it offers that
 * instead of checkout: asking someone to pay before they have seen the Premium
 * tools is the worse of the two conversations.
 */
export function UpgradeButton({ label = "Upgrade to Premium", className = "btn btn-primary" }: { label?: string; className?: string }) {
  const ctx = useUsageOptional();
  const trialEligible = ctx?.trialEligible ?? false;
  const requiresCard = ctx?.trialRequiresCard ?? true;
  const trialDays = ctx?.trialDays ?? 7;
  const checkout = useUpgrade();
  const trial = useTrial();

  // A card-backed trial IS checkout — Stripe applies the trial days to the
  // subscription — so the button opens checkout but says what actually happens.
  if (trialEligible && requiresCard) {
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

  if (trialEligible) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button type="button" className={className} onClick={trial.start} disabled={trial.busy}>
          {trial.busy
            ? <><span className="spinner" /> Starting…</>
            : <><Icon name="zap" size={16} /> Try Premium free for {trialDays} days</>}
        </button>
        <span className="text-xs text-muted">No card needed. Nothing charges automatically.</span>
        {trial.err && <span className="text-xs text-red-300">{trial.err}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={checkout.start} disabled={checkout.busy}>
        {checkout.busy ? <><span className="spinner" /> Opening checkout…</> : <><Icon name="zap" size={16} /> {label}</>}
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
      {left === 0 ? "Trial ends today" : `${left} day${left === 1 ? "" : "s"} of Premium left`}
    </span>
  );
}
