"use client";
import { useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Field, Loading, Page, useToast } from "../ui";

type Branding = { siteName: string; tagline: string; logoUrl: string; supportEmail: string; heroHeadline: string; heroSubline: string };
type Flags = {
  aiDisabled: boolean; signupsOpen: boolean; blogEnabled: boolean; maintenanceNote: string;
  trialEnabled: boolean; trialDays: number; trialRequiresCard: boolean; supportEnabled: boolean;
};

function Toggle({ on, onChange, label, hint, danger }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-3.5 last:border-0">
      <div className="min-w-0">
        <p className={`text-sm ${danger && on ? "text-red-200" : "text-paper"}`}>{label}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? (danger ? "bg-red-500" : "bg-lamp") : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export default function BrandingPage() {
  const [b, setB] = useState<Branding | null>(null);
  const [f, setF] = useState<Flags | null>(null);
  const [saving, setSaving] = useState("");
  const { toast, toastNode } = useToast();

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.settings) { setB(j.settings.branding); setF(j.settings.flags); } })
      .catch(() => toast("Could not load settings.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(key: "branding" | "flags", value: unknown) {
    setSaving(key);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not save.", true); return; }
      setB(j.settings.branding); setF(j.settings.flags);
      toast("Saved.");
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setSaving(""); }
  }

  if (!b || !f) return <Page title="Branding & site"><Loading rows={5} /></Page>;

  return (
    <Page title="Branding & site" sub="The name, logo and words on the public pages, plus the switches that control the whole site.">
      {toastNode}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg text-paper">Identity</h2>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving === "branding"} onClick={() => save("branding", b)}>
                {saving === "branding" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save</>}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site name"><input className="input" value={b.siteName} onChange={(e) => setB({ ...b, siteName: e.target.value })} /></Field>
              <Field label="Support email"><input className="input" type="email" value={b.supportEmail} onChange={(e) => setB({ ...b, supportEmail: e.target.value })} /></Field>
              <div className="sm:col-span-2">
                <Field label="Logo image URL" hint="leave empty to use the built-in mark">
                  <input className="input" value={b.logoUrl} onChange={(e) => setB({ ...b, logoUrl: e.target.value })} placeholder="https://…/logo.png" />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Tagline" hint="used in the footer"><input className="input" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-lg text-paper">Homepage hero</h2>
            <div className="space-y-4">
              <Field label="Headline"><input className="input" value={b.heroHeadline} onChange={(e) => setB({ ...b, heroHeadline: e.target.value })} /></Field>
              <Field label="Supporting line"><textarea className="input" rows={3} value={b.heroSubline} onChange={(e) => setB({ ...b, heroSubline: e.target.value })} /></Field>
            </div>
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="mb-2 text-xs text-muted">Preview</p>
              <p className="font-display text-2xl leading-tight text-paper">{b.heroHeadline || "Your headline"}</p>
              <p className="lede mt-2 text-sm">{b.heroSubline || "Your supporting line"}</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm mt-4" disabled={saving === "branding"} onClick={() => save("branding", b)}>
              {saving === "branding" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save hero</>}
            </button>
          </Card>
        </div>

        <aside>
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg text-paper">Site switches</h2>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving === "flags"} onClick={() => save("flags", f)}>
                {saving === "flags" ? <span className="spinner" /> : <Icon name="save" size={14} />}
              </button>
            </div>
            <Toggle on={f.aiDisabled} onChange={(v) => setF({ ...f, aiDisabled: v })} danger
              label="Pause all AI features" hint="Every tool returns a friendly 'paused' message. Use this if costs spike." />
            <Toggle on={f.signupsOpen} onChange={(v) => setF({ ...f, signupsOpen: v })}
              label="Allow new sign-ups" hint="Turn off to stop new accounts while keeping existing users working." />
            <Toggle on={f.blogEnabled} onChange={(v) => setF({ ...f, blogEnabled: v })}
              label="Show the blog" hint="Hides /blog from visitors without deleting any posts." />
            <Toggle on={f.supportEnabled} onChange={(v) => setF({ ...f, supportEnabled: v })}
              label="In-app support tickets" hint="Off sends users to your support email instead. Open tickets stay readable in the inbox." />
            <Toggle on={f.trialEnabled} onChange={(v) => setF({ ...f, trialEnabled: v })}
              label="Offer a free Premium trial" hint="New accounts can try Premium once, with no card. Trials already running are unaffected." />
            {f.trialEnabled && (
              <>
                <Toggle on={f.trialRequiresCard} onChange={(v) => setF({ ...f, trialRequiresCard: v })}
                  label="Take a card for the trial"
                  hint="On: Stripe runs the trial, nothing is charged until it ends, and it becomes a paid plan unless the user cancels — they can do that themselves at any time. Off: no card at all, and the trial just expires." />
                <div className="pt-3">
                  <Field label="Trial length" hint="1 to 90 days">
                    <input type="number" min={1} max={90} className="input !w-28"
                      value={f.trialDays}
                      onChange={(e) => setF({ ...f, trialDays: Math.min(90, Math.max(1, Number(e.target.value) || 1)) })} />
                  </Field>
                  <p className="mt-1.5 text-xs text-muted">
                    Only changes trials started from now on. Trials already running keep the length they were given.
                  </p>
                </div>
              </>
            )}
            <div className="pt-4">
              <Field label="Site-wide notice" hint="empty = hidden">
                <textarea className="input" rows={3} value={f.maintenanceNote} onChange={(e) => setF({ ...f, maintenanceNote: e.target.value })}
                  placeholder="e.g. Scheduled maintenance tonight at 1 a.m." />
              </Field>
            </div>
            <button type="button" className="btn btn-primary btn-sm mt-4 w-full" disabled={saving === "flags"} onClick={() => save("flags", f)}>
              {saving === "flags" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save switches</>}
            </button>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
