"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Confirm, Empty, Field, Loading, Page, Pill, useToast } from "../ui";

type Row = {
  id: string; label: string; key_preview: string;
  base_url: string; model: string; transcribe_model: string;
  priority: number; enabled: boolean;
  status: "unknown" | "ok" | "failed";
  last_error: string | null; last_checked_at: string | null; last_ok_at: string | null;
  calls: number; failures: number;
};

type Env = { present: boolean; preview?: string; baseUrl?: string; model?: string };

/** The two setups people actually use, so nobody has to remember a base URL. */
const PRESETS = [
  { name: "OpenAI", baseUrl: "", model: "gpt-4o-mini", transcribeModel: "whisper-1",
    hint: "Paid. Best quality, and the only one with a proper transcription endpoint." },
  { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.5-flash", transcribeModel: "",
    hint: "Has a free tier. No transcription endpoint, so recordings go through the chat fallback." },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini", transcribeModel: "",
    hint: "One key, many models. Useful for trying models without new accounts." },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile", transcribeModel: "whisper-large-v3",
    hint: "Very fast, generous free tier." },
];

const blank = { label: "", apiKey: "", baseUrl: "", model: "gpt-4o-mini", transcribeModel: "", priority: 100, enabled: true };
type Draft = typeof blank;

const when = (iso: string | null) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function AiKeysPage() {
  const { toast, toastNode } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [env, setEnv] = useState<Env>({ present: false });
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setSetupNeeded(null);
    try {
      const r = await fetch("/api/admin/ai", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.setupNeeded) setSetupNeeded(j.error);
        else toast(j.error || "Could not load the keys.", true);
        setRows([]); return;
      }
      setRows(j.providers ?? []); setEnv(j.env ?? { present: false });
    } catch { setRows([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/ai", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "That did not save.", true); return false; }
      toast(okMsg); await load(); return true;
    } catch { toast("Network problem. Nothing was saved.", true); return false; }
    finally { setBusy(false); }
  }

  async function test(payload: Record<string, unknown>, which: string) {
    setTesting(which); setTestResult(null);
    try {
      const r = await fetch("/api/admin/ai", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      setTestResult(j.ok
        ? { ok: true, text: `Working. It replied "${j.reply}".` }
        : { ok: false, text: j.error || "The test failed." });
      if (payload.id) await load();
    } catch { setTestResult({ ok: false, text: "Could not reach the server." }); }
    finally { setTesting(null); }
  }

  async function remove(row: Row) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/ai?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      if (r.ok) { toast("Key deleted."); await load(); } else toast("Could not delete it.", true);
    } finally { setBusy(false); setAsk(null); }
  }

  if (setupNeeded)
    return (
      <Page title="AI keys">
        {toastNode}
        <Card><div className="mx-auto max-w-lg py-10 text-center">
          <h2 className="font-display text-lg text-paper">One migration to run first</h2>
          <p className="mt-2 text-sm text-muted">{setupNeeded}</p>
          <code className="mt-4 inline-block rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-paper/85">supabase/010_ai_providers.sql</code>
          <div className="mt-6"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            <Icon name="refresh" size={14} /> Check again</button></div>
        </div></Card>
      </Page>
    );

  const form = draft ?? edit;
  const isEdit = !!edit;
  const setForm = (v: Draft) => (isEdit ? setEdit(v) : setDraft(v));
  const live = (rows ?? []).filter((r) => r.enabled);

  return (
    <Page
      title="AI keys"
      sub="Which account the AI tools run on. Add more than one and a dead or rate-limited key falls over to the next."
      actions={!form && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDraft({ ...blank }); setTestResult(null); }}>
          <Icon name="plus" size={14} /> Add a key
        </button>
      )}
    >
      {toastNode}

      {/* ---- what is actually in use ---- */}
      {rows !== null && (
        <Card className="mb-5">
          {live.length === 0 && !env.present ? (
            <p className="flex items-start gap-2.5 text-sm text-red-200">
              <Icon name="ban" size={16} className="mt-0.5 shrink-0" />
              <span>
                <strong>No key is set, so every AI tool is failing.</strong> Add one below — that is all this needs.
              </span>
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-paper">
                <Icon name="check" size={15} className="text-mint" />
                Requests go to <strong>{live[0]?.label ?? "the environment variables"}</strong> first
                {live.length > 1 && <span className="text-muted">, then {live.length - 1} more if it fails</span>}
              </p>
              {env.present && (
                <p className="text-xs text-muted">
                  There is also a key in the environment variables ({env.preview}, model {env.model}).
                  {live.length > 0 ? " It is the last resort if everything here fails." : " It is what the app is using right now."}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ---- the form ---- */}
      {form && (
        <Card className="mb-5">
          <h2 className="mb-4 font-display text-base text-paper">{isEdit ? "Edit key" : "Add a key"}</h2>

          {!isEdit && (
            <div className="mb-5">
              <p className="mb-2 text-xs text-muted">Start from a provider, or fill it in yourself.</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" title={p.hint}
                    onClick={() => setForm({ ...form, label: p.name, baseUrl: p.baseUrl, model: p.model, transcribeModel: p.transcribeModel })}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-paper/85 transition hover:border-violet-400/50 hover:text-paper">
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Name" hint="just for you">
              <input className="input" maxLength={60} value={form.label} placeholder="OpenAI paid"
                onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </Field>
            <Field label={isEdit ? "Replace the key" : "API key"} hint={isEdit ? "leave empty to keep the current one" : undefined}>
              <input className="input font-mono !text-sm" type="password" autoComplete="off" maxLength={400}
                value={form.apiKey} placeholder={isEdit ? "••••••••" : "sk-…"}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </Field>
            <Field label="Model">
              <input className="input" maxLength={80} value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
            <Field label="Base URL" hint="empty = OpenAI">
              <input className="input !text-sm" maxLength={300} value={form.baseUrl} placeholder="https://…/v1"
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </Field>
            <Field label="Transcription model" hint="for lecture recordings; empty = none">
              <input className="input" maxLength={80} value={form.transcribeModel} placeholder="whisper-1"
                onChange={(e) => setForm({ ...form, transcribeModel: e.target.value })} />
            </Field>
            <Field label="Order" hint="lower is tried first">
              <input type="number" min={0} max={999} className="input !w-28" value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          </div>

          {testResult && (
            <p className={`mt-4 rounded-xl border p-3 text-sm ${
              testResult.ok ? "border-mint/30 bg-mint/10 text-mint" : "border-red-400/30 bg-red-500/10 text-red-100"}`}>
              {testResult.text}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm"
              disabled={busy || !form.label.trim() || (!isEdit && !form.apiKey.trim())}
              onClick={async () => {
                const payload = { ...form, ...(editing ? { id: editing } : {}) };
                const ok = isEdit
                  ? await send("PATCH", payload, "Key saved.")
                  : await send("POST", payload, "Key added.");
                if (ok) { setDraft(null); setEdit(null); setEditing(null); setTestResult(null); }
              }}>
              {busy ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save</>}
            </button>

            {!isEdit && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={!form.apiKey.trim() || testing === "new"}
                onClick={() => test({ apiKey: form.apiKey, baseUrl: form.baseUrl, model: form.model }, "new")}>
                {testing === "new" ? <><span className="spinner" /> Testing…</> : <><Icon name="zap" size={14} /> Test before saving</>}
              </button>
            )}

            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => { setDraft(null); setEdit(null); setEditing(null); setTestResult(null); }}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {/* ---- the keys ---- */}
      {rows === null ? <Loading rows={3} /> : rows.length === 0 ? (
        <Card><Empty>
          No keys here yet.{env.present ? " The app is running on the environment variable." : " Add one to switch the AI tools on."}
        </Empty></Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <p className="font-medium text-paper">{r.label}</p>
                    {r.enabled && i === 0 && <Pill tone="live">In use</Pill>}
                    {!r.enabled && <Pill tone="draft">Off</Pill>}
                    {r.status === "failed" && <Pill tone="blocked">Failing</Pill>}
                    {r.status === "ok" && <Pill tone="premium">Working</Pill>}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <code>{r.key_preview}</code>
                    <span>{r.model}</span>
                    {r.base_url && <code className="truncate">{r.base_url}</code>}
                    {r.calls > 0 && <span>{r.calls.toLocaleString()} calls</span>}
                    {r.failures > 0 && <span className="text-red-200">{r.failures} failed</span>}
                    <span>checked {when(r.last_checked_at)}</span>
                  </p>
                  {r.status === "failed" && r.last_error && (
                    <p className="mt-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                      {r.last_error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-1">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={testing === r.id}
                    onClick={() => test({ id: r.id }, r.id)}>
                    {testing === r.id ? <span className="spinner" /> : <Icon name="zap" size={13} />} Test
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => send("PATCH", { id: r.id, enabled: !r.enabled }, r.enabled ? "Turned off." : "Turned on.")}>
                    <Icon name={r.enabled ? "ban" : "check"} size={13} /> {r.enabled ? "Off" : "On"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setDraft(null); setEditing(r.id); setTestResult(null);
                      setEdit({ label: r.label, apiKey: "", baseUrl: r.base_url, model: r.model,
                                transcribeModel: r.transcribe_model, priority: r.priority, enabled: r.enabled });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  <button type="button" aria-label="Delete key" onClick={() => setAsk(r)}
                    className="rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>

              {testing !== r.id && testResult && editing === null && draft === null && (
                <span className="sr-only">{testResult.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Card className="!p-4 mt-6">
        <h3 className="mb-2 text-sm font-semibold text-paper">How the order works</h3>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>· Every request tries the top key first and works down only when one fails.</li>
          <li>· A key out of quota, rate limited or rejected moves on to the next. A bad request does not — the same mistake would fail on every key.</li>
          <li>· The key in your environment variables is always the last resort, so the app keeps working even if this list is emptied.</li>
          <li>· Keys are never sent back to this page. To change one, paste a new value over it.</li>
        </ul>
      </Card>

      <Confirm
        open={!!ask}
        title="Delete this key?"
        message={`"${ask?.label ?? ""}" is removed and requests move to the next one down. The key itself is not revoked — do that at the provider.`}
        confirmLabel="Delete" danger
        onCancel={() => setAsk(null)}
        onConfirm={() => ask && remove(ask)}
      />
    </Page>
  );
}
