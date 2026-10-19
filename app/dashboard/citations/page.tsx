"use client";
import { useState } from "react";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

export default function CitationsPage() {
  const tool = useToolRunner<{ citations: { text: string }[]; disclaimer?: string }>("/api/generate-citations");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("APA");
  const [count, setCount] = useState(6);
  const [list, setList] = useState<{ text: string }[]>([]);
  const [note, setNote] = useState("");

  async function generate() { const j = await tool.run({ topic, style, count }); if (j) { setList(j.citations); setNote(j.disclaimer ?? ""); } }

  return (
    <ToolFrame toolKey="citations">
      <div className="space-y-5">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px_160px]">
            <Field label="Topic" hint={`${topic.length}/300`}><input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic.trim() && generate()} placeholder="e.g. Effects of social media on teenagers" /></Field>
            <Field label="Style"><select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>{["APA", "MLA", "Chicago"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label={`How many: ${count}`}><input type="range" min={5} max={8} value={count} onChange={(e) => setCount(+e.target.value)} className="mt-3 w-full accent-amber-400" /></Field>
          </div>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Generate citations" /></div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={6} /></Panel>}
        {!tool.loading && list.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3"><p className="text-xs text-lampsoft/90">{note || "AI-generated citations can contain errors. Verify each source before using it."}</p><CopyButton label="Copy all" text={list.map((c) => c.text).join("\n\n")} /></div>
            {list.map((c, i) => (
              <div key={i} className="glass pop-in flex items-start gap-3 rounded-2xl p-4" style={{ animationDelay: `${i * 45}ms` }}>
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-500/20 text-xs font-semibold text-lampsoft">{i + 1}</span>
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-paper/85">{c.text}</p>
                <CopyButton text={c.text} label="" />
              </div>
            ))}
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
