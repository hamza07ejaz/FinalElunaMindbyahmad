"use client";
import { useState } from "react";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Res = { corrected: string; changes?: { from: string; to: string; reason: string }[] };
const TONES = ["Academic", "Professional", "Casual"];

export default function GrammarPage() {
  const tool = useToolRunner<Res>("/api/grammar");
  const [text, setText] = useState("");
  const [tone, setTone] = useState("Professional");
  const [res, setRes] = useState<Res | null>(null);

  async function generate() { const j = await tool.run({ text, tone }); if (j) setRes(j); }

  return (
    <ToolFrame toolKey="grammar">
      <div className="space-y-5">
        <Panel>
          <Field label="Your text" hint={`${text.length}/6000`}><textarea className="input" rows={7} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text you want to fix…" /></Field>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-white/5 p-1">
              {TONES.map((t) => <button key={t} type="button" onClick={() => setTone(t)} className={`rounded-lg px-3 py-1.5 text-sm transition ${tone === t ? "bg-lamp text-[#07040f]" : "text-muted hover:text-paper"}`}>{t}</button>)}
            </div>
            <GenerateButton loading={tool.loading} disabled={!text.trim()} onClick={generate} label="Fix my writing" loadingLabel="Checking…" />
          </div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={6} /></Panel>}
        {!tool.loading && res && (
          <div className="pop-in space-y-4">
            <Panel>
              <div className="mb-3 flex items-center justify-between"><span className="chip chip-ok">Corrected text</span><CopyButton text={res.corrected} /></div>
              <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-paper">{res.corrected}</p>
            </Panel>
            {res.changes && res.changes.length > 0 && (
              <Panel>
                <h3 className="mb-3 text-sm font-semibold text-paper">What changed ({res.changes.length})</h3>
                <ul className="space-y-3">
                  {res.changes.map((c, i) => (
                    <li key={i} className="rounded-xl bg-white/[0.04] p-3 text-sm">
                      <p><span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-200 line-through">{c.from}</span> <span className="text-muted">→</span> <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-200">{c.to}</span></p>
                      <p className="mt-1.5 text-muted">{c.reason}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
