"use client";
import { useEffect, useRef, useState } from "react";
import { AttachButton, AttachedChip, useAttach } from "../../_components/Attach";
import { ExportMenu } from "../../_components/ExportMenu";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { Speak } from "../../_components/Speak";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Result = { translated: string; target: string; source: string | null; original: string };

const LANGUAGES = [
  "English", "Urdu", "Roman Urdu", "Hindi", "Arabic", "Spanish", "French", "German",
  "Portuguese", "Italian", "Dutch", "Turkish", "Russian", "Chinese (Simplified)",
  "Japanese", "Korean", "Indonesian", "Bengali", "Punjabi", "Persian", "Swahili",
];

const TONES = [
  { v: "faithful", l: "Faithful", d: "Keeps the original wording and structure" },
  { v: "simple", l: "Simpler", d: "Plain language, same facts" },
  { v: "academic", l: "Academic", d: "Formal register for essays" },
];

const MAX = 6000;

export default function TranslatePage() {
  const tool = useToolRunner<Result>("/api/translate");
  const attach = useAttach();
  const [text, setText] = useState("");
  const [target, setTarget] = useState("English");
  const [tone, setTone] = useState("faithful");
  const [result, setResult] = useState<Result | null>(null);
  const [side, setSide] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const file = new URLSearchParams(window.location.search).get("file");
    if (!file) return;
    window.history.replaceState(null, "", "/dashboard/translate");
    void attach.adopt(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setResult(null);
    const j = await tool.run({ text, target, tone, uploadId: attach.file?.id ?? null });
    if (j) setResult(j);
  }

  const ready = (!!text.trim() || !!attach.file) && !!target;

  return (
    <ToolFrame toolKey="translate" wide>
      <div className="space-y-5">
        <Panel>
          {attach.file && (
            <AttachedChip file={attach.file} onClear={attach.clear} note="this whole file will be translated" />
          )}

          {!attach.file && (
            <Field label="Text to translate" hint={`${text.length}/${MAX}`}>
              <textarea className="input" rows={7} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Paste notes, a passage, an assignment brief — markdown, formulas and code are kept as they are." />
            </Field>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Translate into">
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Style" hint={TONES.find((t) => t.v === tone)?.d}>
              <select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <GenerateButton loading={tool.loading} disabled={!ready} onClick={run} label="Translate" loadingLabel="Translating…" />
            {!attach.file && (
              <AttachButton onPick={(f) => { void attach.upload(f); }} busy={attach.busy} disabled={attach.left === 0}
                label="Translate a file" className="btn btn-ghost" />
            )}
            {attach.left === 0 && !attach.file && <span className="text-xs text-muted">No uploads left today</span>}
          </div>
        </Panel>

        <ErrorBox error={tool.error || attach.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={8} /></Panel>}

        {!tool.loading && result && (
          <Panel className="pop-in">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="chip chip-ok"><Icon name="translate" size={12} /> {result.target}{result.source ? ` · ${result.source}` : ""}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSide((v) => !v)}>
                  <Icon name={side ? "x" : "expand"} size={14} /> {side ? "Hide original" : "Compare"}
                </button>
                <CopyButton text={result.translated} />
                <Speak text={result.translated} />
                <ExportMenu text={result.translated} title={`${result.source || "Translation"} (${result.target})`} printRef={printRef} />
              </div>
            </div>

            <div className={side ? "grid gap-5 lg:grid-cols-2" : ""}>
              {side && (
                <div className="min-w-0 lg:border-r lg:border-white/10 lg:pr-5">
                  <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-mute/70">Original</p>
                  <div className="max-h-[32rem] overflow-y-auto"><Markdown text={result.original} /></div>
                </div>
              )}
              <div className="min-w-0">
                {side && <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-mute/70">{result.target}</p>}
                <div ref={printRef} className={side ? "max-h-[32rem] overflow-y-auto" : ""}><Markdown text={result.translated} /></div>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </ToolFrame>
  );
}
