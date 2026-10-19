"use client";
import { useRef, useState } from "react";
import { Markdown } from "../../_components/Markdown";
import { ExportMenu } from "../../_components/ExportMenu";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

export default function StudyPlanPage() {
  const tool = useToolRunner<{ plan: string }>("/api/generate-study-plan");
  const [subject, setSubject] = useState("");
  const [days, setDays] = useState(7);
  const [hours, setHours] = useState(2);
  const [plan, setPlan] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  async function generate() {
    const j = await tool.run({ subject, examDate: days, hoursPerDay: hours });
    if (j) setPlan(j.plan);
  }

  return (
    <ToolFrame toolKey="studyPlan">
      <div className="space-y-5">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="What are you studying?" hint={`${subject.length}/300`}><input className="input" maxLength={300} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Organic Chemistry for my final exam" /></Field></div>
            <Field label={`Days until your exam: ${days}`}><input type="range" min={1} max={60} value={days} onChange={(e) => setDays(+e.target.value)} className="w-full accent-amber-400" /></Field>
            <Field label={`Hours you can study per day: ${hours}`}><input type="range" min={0.5} max={12} step={0.5} value={hours} onChange={(e) => setHours(+e.target.value)} className="w-full accent-amber-400" /></Field>
          </div>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!subject.trim()} onClick={generate} label="Build my plan" /></div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={9} /></Panel>}
        {!tool.loading && plan && (
          <Panel className="pop-in"><div className="mb-3 flex justify-end gap-2"><CopyButton text={plan} label="Copy" /><ExportMenu text={plan} title={`Study plan — ${subject}`} printRef={printRef} /></div><div ref={printRef}><Markdown text={plan} /></div></Panel>
        )}
      </div>
    </ToolFrame>
  );
}
