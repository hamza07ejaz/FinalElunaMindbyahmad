"use client";
import { useState } from "react";
import { Icon } from "../../_components/Icon";
import { ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type QA = { question: string; answer: string };

export default function QnaPage() {
  const tool = useToolRunner<{ qna: QA[] }>("/api/generate-qna");
  const [topic, setTopic] = useState("");
  const [items, setItems] = useState<QA[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set());

  async function generate() {
    const j = await tool.run({ topic });
    if (j) { setItems(j.qna); setOpen(new Set()); }
  }
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <ToolFrame toolKey="qna">
      <div className="space-y-5">
        <Panel>
          <Field label="Topic" hint={`${topic.length}/300`}>
            <input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic.trim() && generate()} placeholder="e.g. The French Revolution" />
          </Field>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Generate 10 questions" /></div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={7} /></Panel>}
        {!tool.loading && items.length > 0 && (
          <div className="space-y-3">
            <div className="flex justify-end"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(open.size === items.length ? new Set() : new Set(items.map((_, i) => i)))}>{open.size === items.length ? "Hide all answers" : "Reveal all answers"}</button></div>
            {items.map((it, i) => (
              <div key={i} className="glass pop-in overflow-hidden rounded-2xl" style={{ animationDelay: `${i * 45}ms` }}>
                <button type="button" onClick={() => toggle(i)} className="flex w-full items-start gap-3 p-4 text-left">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-xs font-semibold text-lamp">{i + 1}</span>
                  <span className="flex-1 font-medium text-paper">{it.question}</span>
                  <Icon name="chevron" size={18} className={`mt-0.5 shrink-0 text-muted transition-transform duration-300 ${open.has(i) ? "rotate-90" : ""}`} />
                </button>
                <div className="grid transition-all duration-300" style={{ gridTemplateRows: open.has(i) ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden"><p className="border-t border-white/[0.07] px-4 py-3 pl-[3.25rem] text-[0.92rem] leading-relaxed text-paper/75">{it.answer}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
