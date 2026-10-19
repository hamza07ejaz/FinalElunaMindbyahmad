"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { UpgradeButton } from "./Upgrade";

export type Billing = {
  plan: "free" | "premium";
  paidPlan: "free" | "premium";
  onTrial: boolean;
  trialEndsAt: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  renewsAt: string | null;
  canManage: boolean;
  hasSubscription: boolean;
  trialUsed: boolean;
  trialRequiresCard: boolean;
  trialDays: number;
  supportEmail: string;
  setupNeeded?: boolean;
};

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";

const daysLeft = (iso: string | null) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

/**
 * The billing panel.
 *
 * The thing a user most needs to find here is how to stop paying. Burying that
 * is a dark pattern and generates the support tickets nobody wants, so the
 * manage/cancel button is always in plain sight whenever there is a
 * subscription to cancel.
 */
export function BillingCard() {
  const [b, setB] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // The guard matters here: the portal redirect can unmount this mid-flight.
  useEffect(() => {
    let alive = true;
    fetch("/api/billing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setB(j as Billing); })
      .catch(() => { /* the rest of the account page still works */ });
    return () => { alive = false; };
  }, []);

  async function manage() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/billing", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.url) { window.location.href = j.url; return; }
      setErr(j.error || "Could not open the billing page.");
    } catch { setErr("Network problem. Please try again."); }
    setBusy(false);
  }

  if (!b) return <div className="skeleton h-28 rounded-2xl" />;

  const trialing = b.onTrial;
  const premium = b.paidPlan === "premium";
  const left = daysLeft(b.trialEndsAt);

  return (
    <div className="space-y-4">
      {/* ---- what is happening right now ---- */}
      {trialing ? (
        <div className="rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-paper">
            <Icon name="zap" size={15} className="text-lamp" />
            Premium trial · {left === 0 ? "ends today" : `${left} day${left === 1 ? "" : "s"} left`}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {b.hasSubscription
              ? b.cancelAtPeriodEnd
                ? `Already cancelled. You keep Premium until ${date(b.trialEndsAt)} and will not be charged.`
                : `Your card is on file. The first payment is taken on ${date(b.trialEndsAt)} unless you cancel before then — cancelling during the trial costs nothing.`
              : `No card is held. On ${date(b.trialEndsAt)} you simply drop back to the free plan.`}
          </p>
        </div>
      ) : premium ? (
        <div className="rounded-xl border border-mint/25 bg-mint/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-paper">
            <Icon name="check" size={15} className="text-mint" /> Premium
            {b.status === "past_due" && <span className="chip !border-red-400/40 !bg-red-500/15 !text-red-200">Payment failed</span>}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {b.status === "past_due"
              ? "Stripe could not take the last payment and is retrying. Update your card to keep Premium."
              : b.cancelAtPeriodEnd
                ? `Cancelled. Premium stays active until ${date(b.renewsAt)}, then your account moves to the free plan. Nothing more will be charged.`
                : b.renewsAt
                  ? `Renews on ${date(b.renewsAt)}. You can cancel any time and keep access until that date.`
                  : "Active."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-medium text-paper">Free plan</p>
          <p className="mt-1.5 text-xs text-muted">
            Nothing is charged.
            {b.trialUsed
              ? " Your free trial has been used."
              : b.trialRequiresCard
                ? ` Premium starts with a ${b.trialDays}-day free trial — cancel any time during it and you pay nothing.`
                : ` You can still try Premium free for ${b.trialDays} days, no card needed.`}
          </p>
        </div>
      )}

      {err && <p className="text-xs text-red-300">{err}</p>}

      {/* ---- the actions ---- */}
      <div className="flex flex-wrap gap-2">
        {b.canManage ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={manage} disabled={busy}>
            {busy ? <><span className="spinner" /> Opening…</> : <><Icon name="shield" size={14} /> Manage or cancel</>}
          </button>
        ) : premium || trialing ? (
          <p className="text-xs text-muted">
            To cancel, message us from Help &amp; support{b.supportEmail ? <> or email {b.supportEmail}</> : null} and we will handle it.
          </p>
        ) : null}

        {!premium && !trialing && <UpgradeButton label="Go Premium" className="btn btn-primary btn-sm" />}
        {trialing && !b.cancelAtPeriodEnd && b.hasSubscription && (
          <p className="w-full text-xs text-mute/80">
            Cancelling opens Stripe, where it takes one click. You keep Premium for the rest of the trial either way.
          </p>
        )}
      </div>
    </div>
  );
}
