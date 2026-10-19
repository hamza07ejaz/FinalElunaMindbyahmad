"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase/browser";
import { BillingCard } from "../../_components/Billing";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { useUsage } from "../../_components/UsageProvider";
import { TrialBadge, UpgradeButton, trialDaysLeft } from "../../_components/Upgrade";
import { TOOLS } from "../../_components/tools";

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg text-paper">
        {icon && <Icon name={icon} size={18} className="text-lamp" />}{title}
      </h2>
      {children}
    </section>
  );
}

export default function AccountPage() {
  const { plan, email, usage, onTrial, trialEndsAt, trialEligible } = useUsage();
  const [joined, setJoined] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setJoined(data.user?.created_at ?? null)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) { setMsg({ text: "Use at least 6 characters.", bad: true }); return; }
    if (pw !== pw2) { setMsg({ text: "The two passwords do not match.", bad: true }); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setMsg({ text: error.message, bad: true }); return; }
      setPw(""); setPw2(""); setMsg({ text: "Password updated." });
    } catch { setMsg({ text: "Network problem. Nothing changed.", bad: true }); }
    finally { setBusy(false); }
  }

  const rows = TOOLS.filter((t) => !usage[t.key].locked);
  const premium = plan === "premium";

  return (
    <div className="page-enter mx-auto w-full max-w-4xl px-4 py-7 sm:px-6">
      <header className="mb-7">
        <h1 className="font-display text-2xl text-paper">Your account</h1>
        <p className="mt-1 text-sm text-muted">Your plan, what you have used today, and your sign-in details.</p>
      </header>

      {msg && (
        <div role="status" className={`pop-in mb-5 rounded-xl border p-3.5 text-sm ${msg.bad ? "border-red-400/30 bg-red-500/10 text-red-100" : "border-mint/30 bg-mint/10 text-mint"}`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-5">
        <section className="glass-strong relative overflow-hidden rounded-2xl p-6">
          <div className="lamp-glow -right-12 -top-12 h-44 w-44 bg-violet-500/15" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-lamp font-display text-xl text-[#07040f]">
                {(email[0] || "U").toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg text-paper">{email || "Your account"}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {onTrial ? "Premium trial" : premium ? "Premium plan" : "Free plan"}
                  {joined && ` · joined ${new Date(joined).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}
                </p>
              </div>
            </div>
            {onTrial ? <TrialBadge /> : premium ? <span className="chip chip-brand">Premium</span> : <UpgradeButton label="Upgrade" className="btn btn-primary btn-sm" />}
          </div>
        </section>

        <Card title="Today's allowance" icon="zap">
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((t) => {
              const u = usage[t.key];
              const left = Math.max(0, u.limit - u.used);
              const pct = u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0;
              return (
                <li key={t.key}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-paper/85">{t.title}</span>
                    <span className={left === 0 ? "text-xs text-muted" : "text-xs text-mint"}>{left} left</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-lamp transition-[width] duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted">Everything resets at midnight UTC.</p>
          {onTrial ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
              <p className="min-w-0 flex-1 text-sm text-paper/85">
                Your trial has {trialDaysLeft(trialEndsAt)} day{trialDaysLeft(trialEndsAt) === 1 ? "" : "s"} left. When it ends you drop back to the
                free plan automatically — no card was taken and nothing will be charged.
              </p>
              <UpgradeButton label="Keep Premium" className="btn btn-primary btn-sm" />
            </div>
          ) : !premium && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/25 bg-violet-500/5 p-4">
              <p className="min-w-0 flex-1 text-sm text-paper/85">
                {trialEligible
                  ? "Premium raises every limit and unlocks every locked tool. Try it free first — no card needed."
                  : "Premium raises every limit and unlocks every locked tool."}
              </p>
              <UpgradeButton label="See Premium" className="btn btn-primary btn-sm" />
            </div>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Change password" icon="lock">
            <form onSubmit={changePassword} className="space-y-3.5">
              <label className="block">
                <span className="mb-1.5 block text-sm text-paper/90">New password</span>
                <input className="input" type="password" autoComplete="new-password" minLength={6} value={pw}
                  onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-paper/90">Confirm</span>
                <input className="input" type="password" autoComplete="new-password" value={pw2}
                  onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" />
              </label>
              <button type="submit" className="btn btn-primary btn-sm w-full" disabled={busy || !pw || !pw2}>
                {busy ? <><span className="spinner" /> Saving…</> : "Update password"}
              </button>
            </form>
          </Card>

          <Card title="Plan & billing" icon="shield">
            <BillingCard />
            <p className="mt-4 flex items-start gap-2.5 border-t border-white/10 pt-4 text-sm text-paper/85">
              <Icon name="check" size={15} className="mt-0.5 shrink-0 text-mint" />
              Your chats, notes and files stay in your account until you delete them.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/pricing" className="btn btn-ghost btn-sm">View plans</Link>
              <Link href="/dashboard/support" className="btn btn-ghost btn-sm"><Icon name="help" size={14} /> Contact support</Link>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}>
                <Icon name="logout" size={14} /> Sign out
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
