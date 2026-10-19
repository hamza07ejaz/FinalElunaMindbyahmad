"use client";
import { useState } from "react";
import { Icon } from "../../_components/Icon";
import { ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Test = {
  mcqs: { question: string; options: string[]; correctIndex: number }[];
  trueFalse: { statement: string; answer: boolean }[];
  short: { question: string; answer: string }[];
  long: { question: string; answer: string }[];
};

export default function TestPage() {
  const tool = useToolRunner<{ test: Test }>("/api/generate-test");
  const [topic, setTopic] = useState("");
  const [test, setTest] = useState<Test | null>(null);
  const [mcq, setMcq] = useState<number[]>([]);
  const [tf, setTf] = useState<(boolean | null)[]>([]);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  async function generate() {
    const j = await tool.run({ topic });
    if (j?.test) {
      setTest(j.test); setMcq(Array(j.test.mcqs.length).fill(-1)); setTf(Array(j.test.trueFalse.length).fill(null));
      setShown(new Set()); setSubmitted(false);
    }
  }
  const total = test ? test.mcqs.length + test.trueFalse.length : 0;
  const score = test ? test.mcqs.filter((q, i) => mcq[i] === q.correctIndex).length + test.trueFalse.filter((q, i) => tf[i] === q.answer).length : 0;
  const toggle = (k: string) => setShown((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <ToolFrame toolKey="test">
      <div className="space-y-5">
        <Panel>
          <Field label="Topic" hint={`${topic.length}/300`}><input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic.trim() && generate()} placeholder="e.g. Cell biology" /></Field>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Create mock test" /></div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={9} /></Panel>}

        {!tool.loading && test && (
          <div className="space-y-6">
            {submitted && (
              <div className="pop-in glass-strong flex items-center gap-4 rounded-2xl p-5">
                <div className="grid h-16 w-16 place-items-center rounded-2xl text-xl font-semibold text-paper" style={{ background: "var(--lamp)" }}>{Math.round((score / total) * 100)}%</div>
                <div><p className="text-lg font-semibold text-paper">You scored {score} out of {total}</p><p className="text-sm text-muted">{score / total >= 0.8 ? "Excellent work!" : score / total >= 0.5 ? "Good effort. Review the red answers." : "Keep practising, you will get there."}</p></div>
              </div>
            )}

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-lamp">Multiple choice</h2>
              {test.mcqs.map((q, qi) => (
                <Panel key={qi} className="!p-4">
                  <p className="mb-3 font-medium text-paper">{qi + 1}. {q.question}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((o, oi) => {
                      const picked = mcq[qi] === oi; const right = q.correctIndex === oi;
                      const cls = submitted ? (right ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" : picked ? "border-red-400/60 bg-red-500/15 text-red-100" : "border-white/10 text-slate-400") : picked ? "border-violet-400/60 bg-violet-500/15 text-paper" : "border-white/10 text-paper/75 hover:border-white/25 hover:bg-white/5";
                      return <button key={oi} type="button" disabled={submitted} onClick={() => setMcq((a) => a.map((v, k) => (k === qi ? oi : v)))} className={`rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${cls}`}>{o}</button>;
                    })}
                  </div>
                </Panel>
              ))}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-lamp/80">True or false</h2>
              {test.trueFalse.map((q, qi) => (
                <Panel key={qi} className="!p-4">
                  <p className="mb-3 text-paper">{qi + 1}. {q.statement}</p>
                  <div className="flex gap-2">
                    {[true, false].map((v) => {
                      const picked = tf[qi] === v; const right = q.answer === v;
                      const cls = submitted ? (right ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" : picked ? "border-red-400/60 bg-red-500/15 text-red-100" : "border-white/10 text-slate-400") : picked ? "border-violet-400/60 bg-violet-500/15 text-paper" : "border-white/10 text-paper/75 hover:border-white/25";
                      return <button key={String(v)} type="button" disabled={submitted} onClick={() => setTf((a) => a.map((x, k) => (k === qi ? v : x)))} className={`min-w-24 rounded-xl border px-4 py-2 text-sm transition ${cls}`}>{v ? "True" : "False"}</button>;
                    })}
                  </div>
                </Panel>
              ))}
            </section>

            {([["short", "Short answer", test.short], ["long", "Long answer", test.long]] as const).map(([k, label, list]) => (
              <section key={k} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-pink-300">{label}</h2>
                {list.map((q, qi) => {
                  const id = `${k}${qi}`;
                  return (
                    <Panel key={id} className="!p-4">
                      <p className="mb-2 font-medium text-paper">{qi + 1}. {q.question}</p>
                      <textarea className="input" rows={k === "long" ? 4 : 2} placeholder="Write your answer here (for your own practice)…" />
                      <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => toggle(id)}>{shown.has(id) ? "Hide model answer" : "Show model answer"}</button>
                      {shown.has(id) && <p className="pop-in mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm leading-relaxed text-emerald-50">{q.answer}</p>}
                    </Panel>
                  );
                })}
              </section>
            ))}

            <div className="flex flex-wrap gap-3">
              {!submitted
                ? <button type="button" className="btn btn-primary" onClick={() => { setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Icon name="check" size={16} /> Submit &amp; see score</button>
                : <button type="button" className="btn btn-ghost" onClick={generate}>New test on this topic</button>}
            </div>
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
