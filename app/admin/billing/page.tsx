"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Confirm, Field, Loading, Page, useToast } from "../ui";

type State = {
  source: "admin" | "env" | "none";
  enabled: boolean;
  mode: "live" | "test" | "unknown";
  ready: boolean;
  problems: string[];
  accountName: string;
  secretPreview: string;
  publishableKey: string;
  priceId: string;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  webhookUrlMatches: boolean;
  expectedWebhookUrl: string;
  envFallback: { secret: boolean; price: boolean; webhook: boolean };
  demoCheckoutEnv: boolean;
};

type Check = { label: string; ok: boolean; detail: string };
type Price = { id: string; label: string; amount: string; interval: string };

export default function BillingPage() {
  const { toast, toastNode } = useToast();
  const [s, setS] = useState<State | null>(null);
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [prices, setPrices] = useState<Price[] | null>(null);
  const [newPrice, setNewPrice] = useState({ name: "Premium", amount: "9.99", currency: "usd", interval: "month" });
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setSetupNeeded(null);
    try {
      const r = await fetch("/api/admin/stripe");
      const j = await r.json();
      if (!r.ok) { setSetupNeeded(j.error ?? "Could not load."); return; }
      setS(j);
    } catch { setSetupNeeded("Could not reach the server."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(method: string, payload?: Record<string, unknown>, label = "save") {
    setBusy(label);
    try {
      const r = await fetch("/api/admin/stripe", {
        method,
        ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error ?? "That did not work."); return null; }
      if (j.source) setS(j as State);
      return j;
    } catch {
      toast("Could not reach the server.");
      return null;
    } finally { setBusy(null); }
  }

  async function saveKeys() {
    const payload: Record<string, unknown> = {};
    if (secretKey.trim()) payload.secretKey = secretKey.trim();
    if (publishableKey.trim()) payload.publishableKey = publishableKey.trim();
    if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
    if (!Object.keys(payload).length) { toast("Paste a key first."); return; }
    const j = await call("POST", payload, "save");
    if (j) {
      setSecretKey(""); setPublishableKey(""); setWebhookSecret("");
      setChecks(null); setPrices(null);
      toast(`Saved: ${(j.changed ?? []).join(", ")}`);
    }
  }

  if (setupNeeded) return <Page title="Payments"><Card><p className="text-sm text-amber-200">{setupNeeded}</p></Card></Page>;
  if (!s) return <Page title="Payments"><Loading /></Page>;

  const live = s.mode === "live";
  const configured = !!s.secretPreview;

  return (
    <Page
      title="Payments"
      sub="Paste a Stripe key and real checkout switches on by itself. There is no second switch."
    >
      {toastNode}

      {/* The one thing to know at a glance: is this site taking money, and whose? */}
      <Card className={s.ready ? (live ? "!border-emerald-400/35" : "!border-sky-400/30") : "!border-amber-400/35"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-paper">
              <span className="grid h-6 w-6 place-items-center rounded-full"
                style={{ background: s.ready ? (live ? "#10b98133" : "#0ea5e933") : "#f59e0b33" }}>
                <Icon name={s.ready ? "check" : "info"} size={13} />
              </span>
              {s.ready
                ? live ? "Taking real payments" : "Ready, in Stripe test mode"
                : configured ? "Not ready yet" : "No payment keys yet"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {s.ready
                ? live
                  ? `Cards are charged for real${s.accountName ? ` into ${s.accountName}` : ""}. Upgrades go through Stripe.`
                  : `Checkout works end to end with Stripe's test cards${s.accountName ? ` on ${s.accountName}` : ""}. No money moves. Swap in your sk_live_ key when you are ready.`
                : configured
                  ? "Checkout is not running yet — the list below says what is missing."
                  : s.demoCheckoutEnv
                    ? "Upgrades currently use the demo flow, which grants Premium with no payment. Adding a key below replaces it automatically."
                    : "Upgrades are switched off until a key is added."}
            </p>
          </div>
          {configured && (
            <button type="button" className="btn btn-ghost btn-sm shrink-0" disabled={!!busy}
              onClick={async () => { const j = await call("PUT", undefined, "test"); if (j) setChecks(j.checks); }}>
              {busy === "test" ? <span className="spinner" /> : <Icon name="refresh" size={14} />} Check setup
            </button>
          )}
        </div>

        {!s.ready && s.problems.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-3">
            {s.problems.map((p) => (
              <li key={p} className="flex gap-2 text-sm text-paper/85">
                <span className="mt-0.5 shrink-0 text-amber-300"><Icon name="x" size={13} /></span>{p}
              </li>
            ))}
          </ul>
        )}

        {checks && (
          <ul className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-3">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-2 text-sm">
                <span className={`mt-0.5 shrink-0 ${c.ok ? "text-emerald-300" : "text-amber-300"}`}>
                  <Icon name={c.ok ? "check" : "x"} size={13} />
                </span>
                <span className="text-paper/85"><strong className="font-medium">{c.label}.</strong> {c.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Demo checkout stays reachable only while Stripe is not live, but
            saying so removes the worry people carry from the old setup. */}
        {s.demoCheckoutEnv && s.ready && (
          <p className="mt-3 flex gap-2 border-t border-white/[0.07] pt-3 text-xs text-muted">
            <span className="mt-px shrink-0 text-emerald-300"><Icon name="check" size={12} /></span>
            DEMO_CHECKOUT is still set on the server, but it is ignored now that Stripe is live — the free-upgrade route refuses while real payments are on.
          </p>
        )}
      </Card>

      {/* 1 — the key */}
      <Card>
        <h3 className="mb-1 font-display text-base text-lamp">1. Your Stripe secret key</h3>
        <p className="mb-4 text-sm text-muted">
          Stripe dashboard → Developers → API keys → <strong className="text-paper/85">Secret key</strong>.
          Start with the <strong className="text-paper/85">test</strong> key: everything works, nothing is charged.
          {s.source === "env" && " Right now the key is coming from an environment variable; anything saved here takes over from it."}
        </p>

        <Field label="Secret key" hint={configured ? `Currently ${s.secretPreview}${s.accountName ? ` · ${s.accountName}` : ""} · ${s.mode} mode. Leave blank to keep it.` : "Starts with sk_test_ or sk_live_. It is never shown again after saving."}>
          <input className="input" type="password" autoComplete="off" value={secretKey} maxLength={300}
            onChange={(e) => setSecretKey(e.target.value)} placeholder={configured ? "Paste a new key to replace it" : "sk_test_…"} />
        </Field>

        <div className="mt-3">
          <Field label="Publishable key" hint={`Optional. Safe to expose. ${s.publishableKey ? `Saved: ${s.publishableKey.slice(0, 14)}…` : ""}`}>
            <input className="input" autoComplete="off" value={publishableKey} maxLength={300}
              onChange={(e) => setPublishableKey(e.target.value)} placeholder="pk_test_…" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={saveKeys}>
            {busy === "save" ? <span className="spinner" /> : <Icon name="save" size={15} />} Save key
          </button>
          {configured && (
            <button type="button" className="btn btn-ghost" disabled={!!busy} onClick={() => setConfirmClear(true)}>
              <Icon name="trash" size={15} /> Remove keys
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-mute">The key is checked against Stripe before it is saved, so a mistyped key is refused here rather than at a customer&apos;s checkout.</p>
      </Card>

      {/* 2 — what you are selling */}
      <Card>
        <h3 className="mb-1 font-display text-base text-lamp">2. What Premium costs</h3>
        <p className="mb-4 text-sm text-muted">
          {s.priceId
            ? <>Currently selling <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-paper">{s.priceId}</code>. Press Check setup above to see the amount Stripe has for it.</>
            : "Pick a price you already have in Stripe, or make one here."}
        </p>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!configured || !!busy}
            onClick={async () => { const j = await call("PATCH", { action: "prices" }, "prices"); if (j) setPrices(j.prices ?? []); }}>
            {busy === "prices" ? <span className="spinner" /> : <Icon name="search" size={14} />} Show my Stripe prices
          </button>
        </div>

        {prices && (
          <div className="mt-3 space-y-1">
            {prices.length === 0 && <p className="text-sm text-muted">No recurring prices in this Stripe account yet — make one below.</p>}
            {prices.map((p) => (
              <button key={p.id} type="button" disabled={!!busy}
                onClick={async () => { const j = await call("POST", { priceId: p.id }, "price"); if (j) toast("Price selected."); }}
                className={`flex w-full flex-wrap items-center gap-x-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  s.priceId === p.id ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 hover:border-white/25 hover:bg-white/5"}`}>
                <span className="text-paper">{p.label}</span>
                <span className="text-paper/80">{p.amount} / {p.interval}</span>
                <span className="ml-auto text-xs text-mute">{p.id}</span>
                {s.priceId === p.id && <span className="text-emerald-300"><Icon name="check" size={14} /></span>}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-white/[0.07] pt-4">
          <p className="mb-3 text-sm font-medium text-paper/85">Or create one now</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Name"><input className="input" value={newPrice.name} maxLength={80} onChange={(e) => setNewPrice({ ...newPrice, name: e.target.value })} /></Field>
            <Field label="Amount"><input className="input" inputMode="decimal" value={newPrice.amount} onChange={(e) => setNewPrice({ ...newPrice, amount: e.target.value })} /></Field>
            <Field label="Currency">
              <select className="input" value={newPrice.currency} onChange={(e) => setNewPrice({ ...newPrice, currency: e.target.value })}>
                {["usd", "gbp", "eur", "cad", "aud", "aed", "pkr", "inr"].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </Field>
            <Field label="Every">
              <select className="input" value={newPrice.interval} onChange={(e) => setNewPrice({ ...newPrice, interval: e.target.value })}>
                <option value="month">Month</option><option value="year">Year</option>
              </select>
            </Field>
          </div>
          <button type="button" className="btn btn-ghost mt-3" disabled={!configured || !!busy}
            onClick={async () => { const j = await call("PATCH", { action: "create-price", ...newPrice }, "create-price"); if (j) { setPrices(null); toast("Price created and selected."); } }}>
            {busy === "create-price" ? <span className="spinner" /> : <Icon name="plus" size={15} />} Create in Stripe
          </button>
          <p className="mt-2 text-xs text-mute">This creates a real product and price in your Stripe account. Changing the price later means making a new one — Stripe prices are fixed once created.</p>
        </div>
      </Card>

      {/* 3 — the step people miss */}
      <Card className={configured && !s.hasWebhookSecret ? "!border-amber-400/35" : ""}>
        <h3 className="mb-1 font-display text-base text-lamp">3. The webhook</h3>
        <p className="mb-4 text-sm text-muted">
          This is how Stripe tells the app a payment went through. <strong className="text-paper/85">Without it a customer can pay
          and stay on the free plan</strong>, which is why checkout stays off until it is set up.
        </p>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-xs uppercase tracking-wide text-mute">Endpoint</p>
          <p className="mt-0.5 break-all text-sm text-paper/85">{s.expectedWebhookUrl}</p>
          {s.hasWebhookSecret && (
            <p className={`mt-2 flex gap-1.5 text-xs ${s.webhookUrlMatches ? "text-emerald-300" : "text-amber-300"}`}>
              <span className="mt-px shrink-0"><Icon name={s.webhookUrlMatches ? "check" : "info"} size={12} /></span>
              {s.webhookUrlMatches
                ? "A signing secret is saved."
                : `The saved secret is for ${s.webhookUrl}, which is not this site. Create it again.`}
            </p>
          )}
        </div>

        <button type="button" className="btn btn-primary mt-3" disabled={!configured || !!busy}
          onClick={async () => { const j = await call("PATCH", { action: "create-webhook" }, "webhook"); if (j) toast(j.replaced ? "Webhook replaced." : "Webhook created."); }}>
          {busy === "webhook" ? <span className="spinner" /> : <Icon name="zap" size={15} />}
          {s.hasWebhookSecret ? "Create it again" : "Set up the webhook for me"}
        </button>
        <p className="mt-2 text-xs text-mute">
          This creates the endpoint in your Stripe account and stores the signing secret here. Any existing endpoint pointing at this
          same address is replaced first — Stripe only reveals a signing secret when an endpoint is created, and two endpoints would
          deliver every event twice.
        </p>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted hover:text-paper">Or paste a signing secret yourself</summary>
          <div className="mt-3">
            <Field label="Signing secret" hint="From the endpoint's page in the Stripe dashboard. Starts with whsec_.">
              <input className="input" type="password" autoComplete="off" value={webhookSecret} maxLength={300}
                onChange={(e) => setWebhookSecret(e.target.value)} placeholder="whsec_…" />
            </Field>
            <button type="button" className="btn btn-ghost mt-3" disabled={!!busy} onClick={saveKeys}>
              <Icon name="save" size={15} /> Save secret
            </button>
          </div>
        </details>
      </Card>

      {live && (
        <Card className="!border-amber-400/25 !bg-amber-500/[0.04]">
          <p className="flex gap-2 text-sm text-paper/85">
            <span className="mt-0.5 shrink-0 text-amber-300"><Icon name="info" size={15} /></span>
            <span>
              <strong className="font-medium">You are in live mode.</strong> Test a real card on a small price before announcing it, and
              check the upgrade actually lands: pay, then confirm the account shows Premium. If it does not, the webhook is the thing to look at.
            </span>
          </p>
        </Card>
      )}

      <Confirm
        open={confirmClear}
        title="Remove the payment keys?"
        message="Checkout stops immediately. Existing subscriptions keep billing in Stripe — this only stops new upgrades through this site."
        confirmLabel="Remove"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => { setConfirmClear(false); await call("DELETE", undefined, "clear"); setChecks(null); setPrices(null); toast("Keys removed."); }}
      />
    </Page>
  );
}
