"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExportMenu } from "../../_components/ExportMenu";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";
import type { Note, Report } from "../../../lib/readability";
import type { Piece } from "../../../lib/diff";

type Mode = "natural" | "voice" | "simpler" | "formal" | "shorter";
type Result = {
  rewritten: string;
  modeLabel: string;
  before: Report;
  after: Report;
  change: Record<string, number>;
  beforeNotes: Note[];
  afterNotes: Note[];
  diff: Piece[];
  changedShare: number;
};

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "natural", label: "Sound natural", hint: "Removes the stock phrases and the flat rhythm that make a draft read as machine-written." },
  { id: "voice", label: "In my voice", hint: "Matches your own writing, learned from a sample you paste once." },
  { id: "simpler", label: "Simpler", hint: "Drops the reading level a few school years without losing any facts." },
  { id: "formal", label: "More formal", hint: "Tightens it for an academic reader — no contractions, precise word choice." },
  { id: "shorter", label: "Shorter", hint: "Cuts about a third with nothing important lost." },
];

/** Green when the number moved the right way, amber when it moved the wrong way. */
function Delta({ value, lowerIsBetter = true, suffix = "" }: { value: number; lowerIsBetter?: boolean; suffix?: string }) {
  if (!value) return <span className="text-muted">no change</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  return (
    <span className={good ? "text-emerald-300" : "text-amber-300"}>
      {value > 0 ? "+" : ""}{value}{suffix}
    </span>
  );
}

function StatRow({ r, label }: { r: Report; label: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
      <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-mute">{label}</span>
      <span className="text-paper">Grade <strong className="font-semibold">{r.grade}</strong></span>
      <span className="text-paper/80">{r.avgSentence} words/sentence</span>
      <span className="text-paper/80">rhythm {r.rhythm}</span>
      <span className="text-paper/80">{r.passive} passive</span>
      <span className="text-paper/80">{r.words} words</span>
    </div>
  );
}

const TONE = {
  good: { dot: "#34d399", text: "text-paper/80" },
  watch: { dot: "#fbbf24", text: "text-paper/80" },
  bad: { dot: "#f87171", text: "text-paper" },
} as const;

function Notes({ list }: { list: Note[] }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-2">
      {list.map((n) => (
        <li key={n.label} className="flex gap-2.5 text-sm">
          <span className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[n.tone].dot }} />
          <span className={TONE[n.tone].text}><strong className="font-medium">{n.label}.</strong> {n.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HumanizePage() {
  const tool = useToolRunner<Result>("/api/humanize");
  const [mode, setMode] = useState<Mode>("natural");
  const [text, setText] = useState("");
  const [sample, setSample] = useState("");
  const [sampleSaved, setSampleSaved] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [live, setLive] = useState<{ report: Report; notes: Note[] } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const sampleWords = useMemo(() => sample.split(/\s+/).filter(Boolean).length, [sample]);
  const textWords = useMemo(() => text.split(/\s+/).filter(Boolean).length, [text]);
  const ready = textWords >= 15 && (mode !== "voice" || sampleWords >= 100);

  // A saved sample means "In my voice" works on a return visit without re-pasting.
  useEffect(() => {
    let alive = true;
    fetch("/api/humanize")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.sample) { setSample(j.sample); setSampleSaved(true); } })
      .catch(() => { /* first visit, or the table is not set up yet */ });
    return () => { alive = false; };
  }, []);

  // Measure what they pasted before they spend an allowance on it. Debounced,
  // because this fires on every keystroke otherwise.
  const measure = useCallback((value: string) => {
    if (value.split(/\s+/).filter(Boolean).length < 15) { setLive(null); return; }
    fetch("/api/humanize", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.report) setLive(j); })
      .catch(() => { /* the panel is a nicety */ });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => measure(text), 600);
    return () => clearTimeout(id);
  }, [text, measure]);

  async function run() {
    const j = await tool.run({ mode, text, sample: mode === "voice" ? sample : undefined });
    if (j) { setResult(j); setShowDiff(false); if (mode === "voice") setSampleSaved(true); }
  }

  const activeMode = MODES.find((m) => m.id === mode)!;

  return (
    <ToolFrame toolKey="humanize">
      <div className="space-y-5">
        <Panel>
          <div className="mb-4 grid gap-1 rounded-xl bg-white/5 p-1 sm:grid-cols-5">
            {MODES.map((m) => (
              <button
                key={m.id} type="button"
                onClick={() => { setMode(m.id); setResult(null); }}
                className={`rounded-lg px-2 py-2 text-sm font-medium transition ${mode === m.id ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-paper shadow" : "text-muted hover:text-paper"}`}
              >{m.label}</button>
            ))}
          </div>
          <p className="mb-4 text-sm text-muted">{activeMode.hint}</p>

          {mode === "voice" && (
            <div className="mb-4">
              <Field
                label="A sample of your own writing"
                hint={sampleSaved ? "Saved — this is reused next time. Replace it whenever your writing changes." : "At least 100 words you wrote yourself, with no AI help. An old essay or assignment is ideal."}
              >
                <textarea
                  className="input min-h-28" maxLength={4000} value={sample}
                  onChange={(e) => { setSample(e.target.value); setSampleSaved(false); }}
                  placeholder="Paste something you wrote yourself…"
                />
              </Field>
              <p className={`mt-1 px-1 text-xs ${sampleWords >= 100 ? "text-emerald-300" : "text-mute"}`}>
                {sampleWords} words{sampleWords < 100 ? ` — ${100 - sampleWords} more needed` : " — enough to match"}
              </p>
            </div>
          )}

          <Field label="The text to rewrite">
            <textarea
              className="input min-h-44" maxLength={6000} value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your draft here…"
            />
          </Field>
          <p className="mt-1 px-1 text-xs text-mute">{textWords} words · up to 6,000 characters</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <GenerateButton loading={tool.loading} disabled={!ready} onClick={run} label="Rewrite" loadingLabel="Rewriting…" />
            {!!result && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setText(result.rewritten); setResult(null); }}>Use the result as the new input</button>}
          </div>
        </Panel>

        {/* What they pasted, measured, before anything is spent on it. */}
        {!result && live && (
          <Panel className="pop-in">
            <h3 className="mb-1 font-display text-base text-lamp">Your draft, as it stands</h3>
            <p className="mb-3 text-xs text-mute">Measured here, not guessed by the AI — the same text always scores the same.</p>
            <div className="mb-4 border-b border-white/[0.07] pb-3"><StatRow r={live.report} label="Now" /></div>
            <Notes list={live.notes} />
            {live.report.tired.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-mute">Phrases worth replacing</p>
                <ul className="space-y-1 text-sm">
                  {live.report.tired.slice(0, 6).map((x) => (
                    <li key={x.phrase} className="text-paper/80">
                      <span className="text-amber-200">&ldquo;{x.phrase}&rdquo;</span>
                      {x.times > 1 && <span className="text-mute"> ×{x.times}</span>}
                      <span className="text-mute"> → </span>{x.instead}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}

        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={9} /></Panel>}

        {!tool.loading && result && (
          <div className="space-y-4">
            <Panel className="pop-in">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base text-lamp">{result.modeLabel}</h3>
                  <p className="text-xs text-mute">{result.changedShare}% of the words changed</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDiff((v) => !v)}>
                    <Icon name={showDiff ? "x" : "grammar"} size={14} /> {showDiff ? "Hide changes" : "Show changes"}
                  </button>
                  <CopyButton text={result.rewritten} />
                  <ExportMenu text={result.rewritten} title="Rewritten draft" printRef={printRef} />
                </div>
              </div>

              {showDiff ? (
                <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">
                  {result.diff.map((p, i) =>
                    // The small horizontal padding is not decoration: a removed
                    // block ending in a full stop sits flush against the added
                    // block that follows it, and the two words read as one.
                    p.kind === "same" ? <span key={i} className="text-paper/70">{p.text}</span>
                    : p.kind === "removed" ? <span key={i} className="rounded bg-red-500/15 px-0.5 text-red-200 line-through decoration-red-400/60">{p.text}</span>
                    : <span key={i} className="rounded bg-emerald-500/15 px-0.5 text-emerald-200">{p.text}</span>,
                  )}
                </p>
              ) : (
                <div ref={printRef}><Markdown text={result.rewritten} /></div>
              )}
            </Panel>

            <Panel className="pop-in">
              <h3 className="mb-3 font-display text-base text-lamp">What changed, measured</h3>
              <div className="space-y-2 border-b border-white/[0.07] pb-3">
                <StatRow r={result.before} label="Before" />
                <StatRow r={result.after} label="After" />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 py-3 text-sm">
                <span className="text-muted">Reading level <Delta value={result.change.grade} /></span>
                <span className="text-muted">Ease <Delta value={result.change.ease} lowerIsBetter={false} /></span>
                <span className="text-muted">Passive <Delta value={result.change.passive} /></span>
                <span className="text-muted">Filler <Delta value={result.change.hedges} /></span>
                <span className="text-muted">Stock phrases <Delta value={result.change.tired} /></span>
                <span className="text-muted">Length <Delta value={result.change.words} lowerIsBetter={false} suffix=" words" /></span>
              </div>
              <Notes list={result.afterNotes} />
            </Panel>
          </div>
        )}

        {/* Said plainly, and on the page rather than buried in terms. */}
        <Panel className="!bg-white/[0.02]">
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-amber-300"><Icon name="info" size={16} /></span>
            <div className="text-sm text-muted">
              <p className="mb-1 font-medium text-paper/85">This improves your writing. It is not an AI detector bypass.</p>
              <p>
                Detectors change constantly, so nothing can reliably beat them — and submitting work you did not write is
                academic misconduct whatever tool produced it. Use this on your own draft, read what comes back, and keep
                only the sentences you would defend in a viva.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </ToolFrame>
  );
}
