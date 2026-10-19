"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Confirm, Empty, Field, Loading, Page, Pill, Stat, useToast } from "../ui";

type Answer = {
  id: string; question: string; answer: string; keywords: string;
  suggested: boolean; enabled: boolean; sort: number; uses: number;
};
type Miss = { id: number; question: string; source: string; created_at: string };
type Stats = { asked: number; answered: number; ai: number; unanswered: number };

const blank = { question: "", answer: "", keywords: "", suggested: false, enabled: true, sort: 100 };

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function BotAnswersPage() {
  const { toast, toastNode } = useToast();
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);

  const [draft, setDraft] = useState<typeof blank | null>(null);
  const [editing, setEditing] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<Answer | null>(null);

  const load = useCallback(async () => {
    setSetupNeeded(null);
    try {
      const r = await fetch("/api/admin/bot", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.setupNeeded) setSetupNeeded(j.error);
        else toast(j.error || "Could not load the bot.", true);
        setAnswers([]); return;
      }
      setAnswers(j.answers ?? []); setMisses(j.misses ?? []); setStats(j.stats ?? null);
    } catch { setAnswers([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(method: "POST" | "PATCH", payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/bot", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "That did not save.", true); return false; }
      toast(okMsg); await load(); return true;
    } catch { toast("Network problem. Nothing was saved.", true); return false; }
    finally { setBusy(false); }
  }

  async function remove(a: Answer) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/bot?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
      if (r.ok) { toast("Answer deleted."); await load(); }
      else toast("Could not delete it.", true);
    } finally { setBusy(false); setAsk(null); }
  }

  if (setupNeeded)
    return (
      <Page title="Chat bubble answers">
        {toastNode}
        <Card><div className="mx-auto max-w-lg py-10 text-center">
          <h2 className="font-display text-lg text-paper">One migration to run first</h2>
          <p className="mt-2 text-sm text-muted">{setupNeeded}</p>
          <code className="mt-4 inline-block rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-paper/85">supabase/009_site_content.sql</code>
          <div className="mt-6"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            <Icon name="refresh" size={14} /> Check again</button></div>
        </div></Card>
      </Page>
    );

  const form = draft ?? editing;

  return (
    <Page
      title="Chat bubble answers"
      sub="What the assistant on the front page says. These are tried before the AI, so they are instant and cost nothing."
      actions={!form && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setDraft({ ...blank })}>
          <Icon name="plus" size={14} /> New answer
        </button>
      )}
    >
      {toastNode}

      {stats && stats.asked > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          <Stat label="Questions asked" value={stats.asked} />
          <Stat label="Answered by you" value={stats.answered}
            hint={stats.asked ? `${Math.round((stats.answered / stats.asked) * 100)}% — the free ones` : undefined} />
          <Stat label="Went to the AI" value={stats.ai} hint="these cost money" />
          <Stat label="Nothing to say" value={stats.unanswered} hint="each one is a gap" />
        </div>
      )}

      {/* ---- the editor ---- */}
      {form && (
        <Card className="mb-5">
          <h2 className="mb-4 font-display text-base text-paper">{editing ? "Edit answer" : "New answer"}</h2>
          <div className="space-y-4">
            <Field label="The question, as a visitor would ask it">
              <input className="input" maxLength={200} value={form.question}
                placeholder="Can it read my lecture slides?"
                onChange={(e) => editing ? setEditing({ ...editing, question: e.target.value }) : setDraft({ ...form, question: e.target.value })} />
            </Field>
            <Field label="The answer" hint="Two or three sentences. It renders in a chat bubble.">
              <textarea className="input !min-h-28" maxLength={1200} value={form.answer}
                onChange={(e) => editing ? setEditing({ ...editing, answer: e.target.value }) : setDraft({ ...form, answer: e.target.value })} />
            </Field>
            <Field label="Other words that should find this answer"
              hint="Space separated. The strongest signal in the matching.">
              <input className="input" maxLength={300} value={form.keywords}
                placeholder="slides powerpoint deck pptx lecture"
                onChange={(e) => editing ? setEditing({ ...editing, keywords: e.target.value }) : setDraft({ ...form, keywords: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-sm text-paper/85">
                <input type="checkbox" checked={form.suggested}
                  onChange={(e) => editing ? setEditing({ ...editing, suggested: e.target.checked }) : setDraft({ ...form, suggested: e.target.checked })} />
                Show as a starter chip
              </label>
              <label className="flex items-center gap-2 text-sm text-paper/85">
                <input type="checkbox" checked={form.enabled}
                  onChange={(e) => editing ? setEditing({ ...editing, enabled: e.target.checked }) : setDraft({ ...form, enabled: e.target.checked })} />
                Live
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !form.question.trim() || !form.answer.trim()}
                onClick={async () => {
                  const ok = editing
                    ? await send("PATCH", { ...editing }, "Answer saved.")
                    : await send("POST", { ...form }, "Answer added.");
                  if (ok) { setDraft(null); setEditing(null); }
                }}>
                {busy ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save</>}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(null); setEditing(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* ---- the answers ---- */}
      {answers === null ? <Loading rows={4} /> : answers.length === 0 ? (
        <Card><Empty>No answers yet. The bot will send every question to the AI until you write some.</Empty></Card>
      ) : (
        <ul className="space-y-2">
          {answers.map((a) => (
            <li key={a.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <p className="font-medium text-paper">{a.question}</p>
                    {a.suggested && <Pill tone="staff">Starter chip</Pill>}
                    {!a.enabled && <Pill tone="draft">Off</Pill>}
                    {a.uses > 0 && <span className="text-xs text-muted">used {a.uses}×</span>}
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{a.answer}</p>
                  {a.keywords && (
                    <p className="mt-2 flex flex-wrap gap-1.5">
                      {a.keywords.split(/\s+/).filter(Boolean).slice(0, 12).map((k) => (
                        <span key={k} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[0.68rem] text-paper/60">{k}</span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(a); setDraft(null); }}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  <button type="button" aria-label="Delete" onClick={() => setAsk(a)}
                    className="rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---- what it could not answer ---- */}
      {misses.length > 0 && (
        <>
          <h2 className="mb-1 mt-10 font-display text-base text-paper">What visitors asked</h2>
          <p className="mb-4 text-sm text-muted">
            These went to the AI or got the fallback. Each one is something the site does not explain well enough —
            write an answer and it becomes free and instant.
          </p>
          <ul className="space-y-2">
            {misses.map((m) => (
              <li key={m.id} className="glass flex flex-wrap items-center gap-3 rounded-xl p-3">
                <span className="min-w-0 flex-1 text-sm text-paper/85">{m.question}</span>
                <Pill tone={m.source === "ai" ? "premium" : "blocked"}>
                  {m.source === "ai" ? "AI answered" : "No answer"}
                </Pill>
                <span className="text-xs text-muted">{when(m.created_at)}</span>
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => { setEditing(null); setDraft({ ...blank, question: m.question }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  <Icon name="plus" size={13} /> Write an answer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Confirm
        open={!!ask}
        title="Delete this answer?"
        message={`"${ask?.question ?? ""}" — the bot will send this question to the AI instead, or give the fallback.`}
        confirmLabel="Delete" danger
        onCancel={() => setAsk(null)}
        onConfirm={() => ask && remove(ask)}
      />
    </Page>
  );
}
