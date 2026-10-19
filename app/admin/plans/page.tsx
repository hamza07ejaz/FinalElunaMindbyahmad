"use client";
import { useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { FEATURES } from "../../../lib/plans";
import { Card, Field, Loading, Page, useToast } from "../ui";

type Rule = { label: string; premiumOnly: boolean; freePerDay: number; premiumPerDay: number; maxInputChars: number; maxTokens: number };
type Pricing = { premiumPrice: string; premiumPeriod: string; freeName: string; premiumName: string; premiumBlurb: string; premiumFeatures: string[] };
type Settings = { rules: Record<string, Rule>; pricing: Pricing };

// Reading the order from the feature list means a new tool is editable here the
// day it ships, instead of quietly having limits no admin can see.
const PREFERRED = ["chat", "upload", "transcript", "notes", "translate", "qna", "studyPlan", "career"];
const ORDER = [...PREFERRED.filter((f) => (FEATURES as string[]).includes(f)), ...FEATURES.filter((f) => !PREFERRED.includes(f))];

export default function PlansPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [saving, setSaving] = useState("");
  const [extra, setExtra] = useState("");
  const { toast, toastNode } = useToast();

  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.settings) { setS(j.settings); setDefaults(j.defaults); setExtra((j.settings.pricing.premiumFeatures ?? []).join("\n")); } })
      .catch(() => toast("Could not load settings.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(key: "rules" | "pricing", value: unknown) {
    setSaving(key);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not save.", true); return; }
      setS(j.settings);
      toast(key === "rules" ? "Limits saved. They apply on the next request." : "Pricing saved.");
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setSaving(""); }
  }

  if (!s || !defaults) return <Page title="Plans & limits"><Loading rows={6} /></Page>;

  const setRule = (k: string, patch: Partial<Rule>) =>
    setS({ ...s, rules: { ...s.rules, [k]: { ...s.rules[k], ...patch } } });

  const num = (v: string, fallback: number) => (v === "" ? 0 : Number.isFinite(Number(v)) ? Number(v) : fallback);

  return (
    <Page title="Plans & limits" sub="Daily limits, which tools are Premium, and what the pricing page says. Changes take effect without a deploy.">
      {toastNode}

      <Card className="mb-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-paper">Pricing page</h2>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving === "pricing"}
            onClick={() => save("pricing", { ...s.pricing, premiumFeatures: extra.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, 8) })}>
            {saving === "pricing" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save pricing</>}
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Premium price" hint="shown exactly as typed">
            <input className="input" value={s.pricing.premiumPrice} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, premiumPrice: e.target.value } })} />
          </Field>
          <Field label="Billing line">
            <input className="input" value={s.pricing.premiumPeriod} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, premiumPeriod: e.target.value } })} />
          </Field>
          <Field label="Free plan name">
            <input className="input" value={s.pricing.freeName} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, freeName: e.target.value } })} />
          </Field>
          <Field label="Paid plan name">
            <input className="input" value={s.pricing.premiumName} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, premiumName: e.target.value } })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Paid plan subtitle">
              <input className="input" value={s.pricing.premiumBlurb} onChange={(e) => setS({ ...s, pricing: { ...s.pricing, premiumBlurb: e.target.value } })} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Extra selling points" hint="one per line, up to 8">
              <textarea className="input" rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Priority support&#10;Early access to new tools" />
            </Field>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          The price here is the text on the page. The amount actually charged comes from your Stripe price, so change it in Stripe too.
        </p>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-paper">Daily limits</h2>
            <p className="mt-1 text-sm text-muted">Per user, per day. Set a free limit to 0 to make a tool Premium-only.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setS({ ...s, rules: defaults.rules })}>Reset to defaults</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving === "rules"} onClick={() => save("rules", s.rules)}>
              {saving === "rules" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save limits</>}
            </button>
          </div>
        </div>

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-white/10 text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-normal">Tool</th>
                <th className="px-2 py-2 font-normal">Premium only</th>
                <th className="px-2 py-2 font-normal">Free / day</th>
                <th className="px-2 py-2 font-normal">Premium / day</th>
                <th className="px-2 py-2 font-normal">Max input chars</th>
                <th className="px-2 py-2 font-normal">Max AI tokens</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.filter((k) => s.rules[k]).map((k) => {
                const r = s.rules[k];
                return (
                  <tr key={k} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-3">
                      <input className="input !w-36 !px-2 !py-1.5 !text-sm" value={r.label} onChange={(e) => setRule(k, { label: e.target.value })} aria-label={`${k} name`} />
                    </td>
                    <td className="px-2 py-2.5">
                      <button type="button" role="switch" aria-checked={r.premiumOnly} aria-label={`${r.label} premium only`}
                        onClick={() => setRule(k, { premiumOnly: !r.premiumOnly })}
                        className={`relative h-6 w-11 rounded-full transition-colors ${r.premiumOnly ? "bg-lamp" : "bg-white/15"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.premiumOnly ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={0} max={100000} disabled={r.premiumOnly}
                        className="input !w-24 !px-2 !py-1.5 !text-sm disabled:opacity-40"
                        value={r.premiumOnly ? 0 : r.freePerDay}
                        onChange={(e) => setRule(k, { freePerDay: num(e.target.value, r.freePerDay) })} aria-label={`${r.label} free per day`} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={0} max={100000} className="input !w-24 !px-2 !py-1.5 !text-sm"
                        value={r.premiumPerDay} onChange={(e) => setRule(k, { premiumPerDay: num(e.target.value, r.premiumPerDay) })} aria-label={`${r.label} premium per day`} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={50} max={200000} step={100} className="input !w-28 !px-2 !py-1.5 !text-sm"
                        value={r.maxInputChars} onChange={(e) => setRule(k, { maxInputChars: num(e.target.value, r.maxInputChars) })} aria-label={`${r.label} max input`} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={50} max={16000} step={100} className="input !w-24 !px-2 !py-1.5 !text-sm"
                        value={r.maxTokens} onChange={(e) => setRule(k, { maxTokens: num(e.target.value, r.maxTokens) })} aria-label={`${r.label} max tokens`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted">
          Max AI tokens is the ceiling on each answer. Raising it makes answers longer and costs more per request;
          lowering it can cut long answers off mid-sentence.
        </p>
      </Card>
    </Page>
  );
}
