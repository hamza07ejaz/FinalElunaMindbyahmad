"use client";
import { useState } from "react";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

export default function ParaphrasePage() {
  const tool = useToolRunner<{ paraphrased: string }>("/api/paraphrase");
  const [text, setText] = useState("");
  const [out, setOut] = useState("");

  async function generate() { const j = await tool.run({ text }); if (j) setOut(j.paraphrased); }

  return (
    <ToolFrame toolKey="paraphrase">
      <div className="space-y-5">
        <Panel>
          <Field label="Text to rewrite" hint={`${text.length}/6000`}><textarea className="input" rows={7} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text you want to paraphrase…" /></Field>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!text.trim()} onClick={generate} label="Paraphrase" loadingLabel="Rewriting…" /></div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={5} /></Panel>}
        {!tool.loading && out && (
          <Panel className="pop-in">
            <div className="mb-3 flex items-center justify-between"><span className="chip chip-ok">Paraphrased</span>
              <div className="flex gap-2"><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setText(out); setOut(""); }}>Use as input</button><CopyButton text={out} /></div></div>
            <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-paper">{out}</p>
          </Panel>
        )}
      </div>
    </ToolFrame>
  );
}
