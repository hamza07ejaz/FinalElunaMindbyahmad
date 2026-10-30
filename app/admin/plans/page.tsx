"use client";
import { useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { FEATURES } from "../../../lib/plans";
import { Card, Confirm, Field, Loading, Page, useToast } from "../ui";

/**
 * Plans.
 *
 * There used to be exactly two, written into the code, and this screen could
 * only edit their numbers. Plans are rows now, so this creates them, names
 * them, prices them, decides what each one includes and in what order they
 * appear — without a deploy.
 *
 * The per-tool caps at the bottom are deliberately not per plan: a maximum
 * input length and a token ceiling protect the AI bill and the model's context
 * window, which are the same whatever somebody paid.
 */

type Plan = {
  slug: string;
  name: string;
  blurb: string;
  priceLabel: string;
  periodLabel: string;
  stripePriceId: string;
  features: string[];
  limits: Record<string, number>;
  isDefault: boolean;
  sort: number;
  enabled: boolean;
};

type Rule = { label: string; premiumOnly: boolean; freePerDay: number; premiumPerDay: number; maxInputChars: number; maxTokens: number };
type Settings = { rules: Record<string, Rule> };

// Reading the order from the feature list means a new tool is editable here the
// day it ships, instead of quietly having limits no admin can see.
const PREFERRED = ["chat", "upload", "transcript", "notes", "translate", "qna", "studyPlan", "career"];
const ORDER = [...PREFERRED.filter((f) => (FEATURES as string[]).includes(f)), ...FEATURES.filter((f) => !PREFERRED.includes(f))];

const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.min(100_000, Math.round(Number(v)) || 0)));

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [saving, setSaving] = useState("");
  const [open, setOpen] = useState<string>("");
  const [ask, setAsk] = useState<Plan | null>(null);
  const { toast, toastNode } = useToast();

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/plans", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/settings", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([p, j]) => {
        if (p.plans) setPlans(p.plans);
        if (j.settings) { setS({ rules: j.settings.rules }); setDefaults({ rules: j.defaults.rules }); }
      })
      .catch(() => toast("Could not load plans.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePlans(next: Plan[]) {
    setSaving("plans");
    try {
      const r = await fetch("/api/admin/plans", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plans: next }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not save the plans.", true); return; }
      setPlans(j.plans);
      toast("Plans saved. The pricing page is already showing them.");
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setSaving(""); }
  }

  async function removePlan(p: Plan) {
    setSaving("plans");
    try {
      const r = await fetch(`/api/admin/plans?slug=${encodeURIComponent(p.slug)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not delete that plan.", true); return; }
      setPlans(j.plans);
      toast(j.moved ? `${p.name} deleted. ${j.moved} account${j.moved === 1 ? "" : "s"} moved to ${j.to}.` : `${p.name} deleted.`);
    } catch { toast("Network problem. Nothing was deleted.", true); }
    finally { setSaving(""); setAsk(null); }
  }

  async function saveRules() {
    if (!s) return;
    setSaving("rules");
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "rules", value: s.rules }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not save.", true); return; }
      setS({ rules: j.settings.rules });
      toast("Caps saved. They apply on the next request.");
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setSaving(""); }
  }

  if (!plans || !s || !defaults) return <Page title="Plans & limits"><Loading rows={6} /></Page>;

  const set = (i: number, patch: Partial<Plan>) =>
    setPlans(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const setLimit = (i: number, key: string, v: number) =>
    set(i, { limits: { ...plans[i].limits, [key]: v } });

  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= plans.length) return;
    const next = [...plans];
    [next[i], next[j]] = [next[j], next[i]];
    setPlans(next.map((p, k) => ({ ...p, sort: k })));
  };

  const makeDefault = (i: number) =>
    setPlans(plans.map((p, j) => ({ ...p, isDefault: j === i })));

  /*
   * A new plan starts from the most generous existing one.
   *
   * Starting from zeros would mean a plan that includes nothing, which is the
   * one thing nobody wants to sell, and filling sixteen numbers by hand before
   * you can see the card is how this screen would get abandoned.
   */
  const addPlan = () => {
    const total = (p: Plan) => ORDER.reduce((a, k) => a + (p.limits[k] ?? 0), 0);
    const richest = [...plans].sort((a, b) => total(b) - total(a))[0];
    const n = plans.length + 1;
    const slug = `plan-${n}`;
    const next: Plan = {
      slug: plans.some((p) => p.slug === slug) ? `plan-${Date.now().toString(36).slice(-4)}` : slug,
      name: `New plan ${n}`,
      blurb: "",
      priceLabel: "",
      periodLabel: "per month",
      stripePriceId: "",
      features: [],
      limits: { ...(richest?.limits ?? {}) },
      isDefault: false,
      sort: plans.length,
      enabled: false, // off until it has a price and a name, so nothing half-made goes on sale
    };
    setPlans([...plans, next]);
    setOpen(next.slug);
  };

  const included = (p: Plan) => ORDER.filter((k) => (p.limits[k] ?? 0) > 0).length;

  return (
    <Page
      title="Plans & limits"
      sub="Create as many plans as you sell. Prices, what each one includes and the order they appear — all without a deploy."
      actions={
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={addPlan}>
            <Icon name="plus" size={14} /> Add a plan
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving === "plans"} onClick={() => savePlans(plans)}>
            {saving === "plans" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save plans</>}
          </button>
        </div>
      }
    >
      {toastNode}

      <Confirm
        open={!!ask}
        title={`Delete ${ask?.name ?? "this plan"}?`}
        message={`Anyone on it moves to the free plan. This does not cancel their Stripe subscription — do that in Stripe, or they keep being charged for a plan that no longer exists.`}
        confirmLabel="Delete plan"
        danger
        onConfirm={() => ask && removePlan(ask)}
        onCancel={() => setAsk(null)}
      />

      <div className="space-y-4">
        {plans.map((p, i) => {
          const isOpen = open === p.slug;
          return (
            <Card key={p.slug} className={p.enabled ? "" : "opacity-70"}>
              {/* ---- the header line, which is all most edits need ---- */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <button type="button" aria-label={`Move ${p.name} up`} disabled={i === 0}
                    className="rounded px-1 text-muted hover:text-paper disabled:opacity-25" onClick={() => move(i, -1)}>
                    <Icon name="chevron" size={14} className="-rotate-90" />
                  </button>
                  <button type="button" aria-label={`Move ${p.name} down`} disabled={i === plans.length - 1}
                    className="rounded px-1 text-muted hover:text-paper disabled:opacity-25" onClick={() => move(i, 1)}>
                    <Icon name="chevron" size={14} className="rotate-90" />
                  </button>
                </div>

                <input
                  className="input !w-44 !py-1.5" value={p.name} aria-label={`Plan ${i + 1} name`}
                  onChange={(e) => set(i, { name: e.target.value })}
                />
                <input
                  className="input !w-28 !py-1.5" value={p.priceLabel} placeholder="$15.99" aria-label={`${p.name} price`}
                  onChange={(e) => set(i, { priceLabel: e.target.value })}
                />

                <span className="chip">{included(p)} of {ORDER.length} tools</span>
                {p.isDefault
                  ? <span className="chip chip-ok">Free · new accounts</span>
                  : p.stripePriceId
                    ? <span className="chip chip-brand">For sale</span>
                    : <span className="chip !border-amber-400/40 !bg-amber-500/15 !text-amber-200">No Stripe price</span>}
                {!p.enabled && <span className="chip">Hidden</span>}

                <div className="ml-auto flex items-center gap-2">
                  <button type="button" role="switch" aria-checked={p.enabled} aria-label={`${p.name} shown on the pricing page`}
                    onClick={() => set(i, { enabled: !p.enabled })}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${p.enabled ? "bg-lamp" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${p.enabled ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(isOpen ? "" : p.slug)}>
                    {isOpen ? "Close" : "Edit"}
                  </button>
                </div>
              </div>

              {/* ---- everything else ---- */}
              {isOpen && (
                <div className="mt-5 space-y-5 border-t border-white/10 pt-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Billing line" hint="under the price">
                      <input className="input" value={p.periodLabel} placeholder="per month, cancel any time"
                        onChange={(e) => set(i, { periodLabel: e.target.value })} />
                    </Field>
                    <Field label="Stripe price ID" hint={p.isDefault ? "not needed for the free plan" : "price_…"}>
                      <input className="input" value={p.stripePriceId} placeholder="price_1AbC…" spellCheck={false}
                        onChange={(e) => set(i, { stripePriceId: e.target.value })} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Subtitle" hint="one line on the card">
                        <input className="input" value={p.blurb} onChange={(e) => set(i, { blurb: e.target.value })}
                          placeholder="For exam weeks and heavy study days." />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Extra selling points" hint="one per line, up to 20">
                        <textarea className="input" rows={3} value={p.features.join("\n")}
                          onChange={(e) => set(i, { features: e.target.value.split("\n") })}
                          placeholder="Priority support&#10;Early access to new tools" />
                      </Field>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium text-paper/90">What this plan includes, per day</h3>
                      <p className="text-xs text-muted">0 means the tool is not in this plan.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {ORDER.map((k) => (
                        <label key={k} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                          <span className="min-w-0 truncate text-sm text-paper/85">{s.rules[k]?.label ?? k}</span>
                          <input
                            type="number" min={0} max={100000}
                            className="input !w-24 !px-2 !py-1 !text-sm"
                            value={p.limits[k] ?? 0}
                            aria-label={`${s.rules[k]?.label ?? k} per day on ${p.name}`}
                            onChange={(e) => setLimit(i, k, num(e.target.value))}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
                    {!p.isDefault && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => makeDefault(i)}>
                        <Icon name="check" size={14} /> Make this the free plan
                      </button>
                    )}
                    {p.isDefault && <p className="text-xs text-muted">New accounts start on this plan, and cancelled subscriptions come back to it.</p>}
                    {!p.isDefault && (
                      <button type="button" className="btn btn-ghost btn-sm ml-auto !border-red-400/40 !text-red-200"
                        onClick={() => setAsk(p)}>
                        <Icon name="trash" size={14} /> Delete plan
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted">
        The price on the card is text — the amount actually charged is the Stripe price you point it at, so change it in both places.
        A plan with no Stripe price can still be shown; it just cannot be bought.
      </p>

      {/* ---- per-tool ceilings, which are not per plan ---- */}
      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-paper">Per-request ceilings</h2>
            <p className="mt-1 text-sm text-muted">
              How much text each tool accepts and how long its answers can be. The same on every plan — these protect the AI bill and the model&apos;s limits, not the price list.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setS({ rules: defaults.rules })}>Reset to defaults</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving === "rules"} onClick={saveRules}>
              {saving === "rules" ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save ceilings</>}
            </button>
          </div>
        </div>

        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-white/10 text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-normal">Tool</th>
                <th className="px-2 py-2 font-normal">Shown as</th>
                <th className="px-2 py-2 font-normal">Max input chars</th>
                <th className="px-2 py-2 font-normal">Max AI tokens</th>
              </tr>
            </thead>
            <tbody>
              {ORDER.filter((k) => s.rules[k]).map((k) => {
                const r = s.rules[k];
                const setRule = (patch: Partial<Rule>) => setS({ rules: { ...s.rules, [k]: { ...r, ...patch } } });
                return (
                  <tr key={k} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-3 text-muted">{k}</td>
                    <td className="px-2 py-2.5">
                      <input className="input !w-36 !px-2 !py-1.5 !text-sm" value={r.label}
                        onChange={(e) => setRule({ label: e.target.value })} aria-label={`${k} name`} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={50} max={200000} step={100} className="input !w-28 !px-2 !py-1.5 !text-sm"
                        value={r.maxInputChars} onChange={(e) => setRule({ maxInputChars: num(e.target.value) })}
                        aria-label={`${r.label} max input`} />
                    </td>
                    <td className="px-2 py-2.5">
                      <input type="number" min={50} max={16000} step={100} className="input !w-24 !px-2 !py-1.5 !text-sm"
                        value={r.maxTokens} onChange={(e) => setRule({ maxTokens: num(e.target.value) })}
                        aria-label={`${r.label} max tokens`} />
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
