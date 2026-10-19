"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExportMenu } from "../../_components/ExportMenu";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";
import { EXPLORE_QUESTIONS, INCOME_QUESTIONS, type Mode, type Plan } from "../../../lib/career";
import { PlanView } from "./_plan";

type Saved = { id: string; mode: Mode; role: string | null; title: string; created_at: string };
type Result = { plan: Plan; id: string | null; text: string };

const TABS: { id: Exclude<Mode, "followup">; label: string; blurb: string; needsRole: boolean }[] = [
  { id: "explore", label: "Find my path", blurb: "Answer seven questions and get three careers that fit your actual answers — including one you have not thought of.", needsRole: false },
  { id: "roadmap", label: "12-month plan", blurb: "A month-by-month plan from no experience to employable, with a provable milestone at each stage.", needsRole: true },
  { id: "reality", label: "The honest truth", blurb: "What the job is really like: a typical day, the pay, the hours, and what makes people leave it.", needsRole: true },
  { id: "income", label: "Earn while studying", blurb: "Realistic ways to earn with the hours and the budget you actually have.", needsRole: false },
];

export default function CareerPage() {
  const tool = useToolRunner<Result>("/api/career");
  const [mode, setMode] = useState<Exclude<Mode, "followup">>("explore");
  const [role, setRole] = useState("");
  const [region, setRegion] = useState("");
  const [skills, setSkills] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Follow-up questions about the plan on screen.
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [thread, setThread] = useState<{ q: string; a: string }[]>([]);

  const tab = TABS.find((t) => t.id === mode)!;
  const questions = mode === "explore" ? EXPLORE_QUESTIONS : INCOME_QUESTIONS;
  const answered = mode === "explore" || mode === "income"
    ? questions.filter((x) => answers[x.q]).length
    : 0;
  const ready = tab.needsRole ? role.trim().length > 1 : answered >= Math.min(2, questions.length);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetch("/api/career");
      if (r.ok) setSaved((await r.json()).plans ?? []);
    } catch { /* offline */ }
  }, []);
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  async function generate() {
    const payload = tab.needsRole
      ? { mode, role, region }
      : { mode, region, answers, ...(mode === "income" ? { skills } : {}) };
    const j = await tool.run(payload);
    if (j) { setResult(j); setThread([]); void loadSaved(); }
  }

  async function openSaved(id: string) {
    setHistoryOpen(false);
    try {
      const r = await fetch(`/api/career?id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const j = await r.json();
      setResult({ plan: j.plan, id: j.id, text: j.text });
      setMode(j.mode === "followup" ? "explore" : j.mode);
      setThread([]);
    } catch { /* offline */ }
  }

  async function removeSaved(id: string) {
    await fetch(`/api/career?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setSaved((s) => s.filter((x) => x.id !== id));
    if (result?.id === id) setResult(null);
  }

  async function ask() {
    const q = question.trim();
    if (!q || !result || asking) return;
    setQuestion(""); setAsking(true);
    try {
      const res = await fetch("/api/career", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "followup", planId: result.id, context: result.id ? undefined : result.text, question: q }),
      });
      const j = await res.json().catch(() => ({}));
      setThread((t) => [...t, { q, a: res.ok ? j.answer : (j.error || "Could not answer that right now.") }]);
    } catch {
      setThread((t) => [...t, { q, a: "Network problem — please try again." }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <ToolFrame toolKey="career">
      <div className="space-y-5">
        <Panel>
          <div className="mb-4 grid gap-1 rounded-xl bg-white/5 p-1 sm:grid-cols-4">
            {TABS.map((t) => (
              <button
                key={t.id} type="button"
                onClick={() => { setMode(t.id); setResult(null); setThread([]); }}
                className={`rounded-lg px-2 py-2 text-sm font-medium transition ${mode === t.id ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-paper shadow" : "text-muted hover:text-paper"}`}
              >{t.label}</button>
            ))}
          </div>
          <p className="mb-4 text-sm text-muted">{tab.blurb}</p>

          {tab.needsRole ? (
            <Field label="Which career?" hint="A job title works best — the more specific, the more useful the answer.">
              <input className="input" maxLength={120} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Data analyst, Nurse, UX designer, Commercial pilot" />
            </Field>
          ) : (
            <div className="space-y-5">
              {mode === "income" && (
                <Field label="What can you already do?" hint="Anything counts — a subject you are good at, a language, a program you know.">
                  <input className="input" maxLength={300} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. good at maths, basic Photoshop, fluent Urdu and English" />
                </Field>
              )}
              {questions.map((x) => (
                <div key={x.id}>
                  <p className="mb-2 text-sm font-medium text-paper/85">{x.q}</p>
                  <div className="flex flex-wrap gap-2">
                    {x.options.map((o) => (
                      <button
                        key={o} type="button"
                        onClick={() => setAnswers((a) => ({ ...a, [x.q]: a[x.q] === o ? "" : o }))}
                        className={`rounded-full border px-3.5 py-1.5 text-sm transition ${answers[x.q] === o ? "border-violet-400/60 bg-violet-500/15 text-paper" : "border-white/10 bg-white/5 text-paper/75 hover:border-white/25"}`}
                      >{o}</button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-mute">{answered} of {questions.length} answered — more answers, better advice.</p>
            </div>
          )}

          {/* Pay figures are meaningless without a country attached to them. */}
          <div className="mt-4">
            <Field label="Where will you be working?" hint="Used for the pay figures. Leave blank for US and UK bands.">
              <input className="input" maxLength={80} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. United Kingdom, Canada, Pakistan, remote for US clients" />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <GenerateButton loading={tool.loading} disabled={!ready} onClick={generate} label="Get my guidance" loadingLabel="Thinking it through…" />
            {saved.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen((v) => !v)}>
                <Icon name="history" size={14} /> Saved plans ({saved.length})
              </button>
            )}
          </div>

          {historyOpen && (
            <div className="mt-3 space-y-1 border-t border-white/[0.07] pt-3">
              {saved.map((s) => (
                <div key={s.id} className="group flex items-center gap-1 rounded-xl pr-1 hover:bg-white/5">
                  <button type="button" onClick={() => openSaved(s.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm text-paper/75 group-hover:text-paper">
                    {s.title}
                  </button>
                  <span className="shrink-0 px-1 text-xs text-mute">{new Date(s.created_at).toLocaleDateString()}</span>
                  <button type="button" onClick={() => removeSaved(s.id)} aria-label="Delete plan" className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={10} /></Panel>}

        {!tool.loading && result && (
          <>
            <div className="flex justify-end gap-2">
              <CopyButton text={result.text} label="Copy all" />
              <ExportMenu text={result.text} title="Career guidance" printRef={printRef} />
            </div>
            <div ref={printRef} className="space-y-3">
              <PlanView plan={result.plan} />
            </div>

            {/* A plan nobody can question is a document, not advice. */}
            <Panel>
              <h3 className="font-display text-base text-lamp">Ask about this plan</h3>
              <p className="mb-3 text-xs text-mute">Anything that is not clear, or does not fit your situation.</p>
              <div className="space-y-3">
                {thread.map((t, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="text-sm font-medium text-paper">{t.q}</p>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><Markdown text={t.a} /></div>
                  </div>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
                <input
                  className="input flex-1" maxLength={500} value={question} disabled={asking}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. Can I do this without a degree? What if I only have 5 hours a week?"
                />
                <button type="submit" className="btn btn-primary shrink-0" disabled={asking || !question.trim()}>
                  {asking ? <span className="spinner" /> : <Icon name="send" size={16} />}
                </button>
              </form>
            </Panel>
          </>
        )}
      </div>
    </ToolFrame>
  );
}
