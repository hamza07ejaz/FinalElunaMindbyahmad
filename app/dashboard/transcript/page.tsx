"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPT_AUDIO, AttachedChip, DropZone, useAttach } from "../../_components/Attach";
import { ExportMenu } from "../../_components/ExportMenu";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { Speak } from "../../_components/Speak";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Result = { transcript: string; notes: string | null; name?: string; cached?: boolean };

const LANGS = [
  { v: "auto", l: "Detect automatically" },
  { v: "en", l: "English" }, { v: "ur", l: "Urdu" }, { v: "hi", l: "Hindi" },
  { v: "ar", l: "Arabic" }, { v: "es", l: "Spanish" }, { v: "fr", l: "French" },
  { v: "de", l: "German" }, { v: "zh", l: "Chinese" }, { v: "pt", l: "Portuguese" },
  { v: "ru", l: "Russian" }, { v: "tr", l: "Turkish" }, { v: "id", l: "Indonesian" },
];

export default function TranscriptPage() {
  const tool = useToolRunner<Result>("/api/transcript");
  const attach = useAttach();
  const [language, setLanguage] = useState("auto");
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const printRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async (id: string) => {
    setResult(null);
    const j = await tool.run({ uploadId: id, language, notes: true });
    if (j) { setResult(j); setTab(j.notes ? "notes" : "transcript"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Arriving from My Files with ?file=<id>: attach it and start straight away.
  useEffect(() => {
    const file = new URLSearchParams(window.location.search).get("file");
    if (!file) return;
    window.history.replaceState(null, "", "/dashboard/transcript");
    void attach.adopt(file).then((a) => { if (a) void run(a.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = tool.loading || attach.busy;
  const body = result ? (tab === "notes" && result.notes ? result.notes : result.transcript) : "";

  return (
    <ToolFrame toolKey="transcript" wide>
      <div className="space-y-5">
        <Panel>
          {attach.file ? (
            <AttachedChip file={attach.file} onClear={() => { attach.clear(); setResult(null); }} note="recording attached" />
          ) : (
            <DropZone
              onPick={(f) => { void attach.upload(f); }} busy={attach.busy} accept={ACCEPT_AUDIO}
              hint="MP3, M4A, WAV, WEBM or OGG · up to 12 MB (roughly 15 minutes)"
            />
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Spoken language" hint="Detection is usually right">
              <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
              </select>
            </Field>
            <GenerateButton
              loading={tool.loading} disabled={!attach.file || attach.busy}
              onClick={() => attach.file && run(attach.file.id)}
              label="Transcribe" loadingLabel="Listening…"
            />
          </div>

          <p className="mt-3 text-xs text-mute/80">
            One use covers the transcript and the revision notes. A recording you have already transcribed opens again for free.
          </p>
        </Panel>

        <ErrorBox error={tool.error || attach.error} upgrade={tool.upgrade} />

        {tool.loading && (
          <Panel>
            <p className="mb-4 flex items-center gap-2 text-sm text-muted"><span className="spinner" /> Transcribing — a long recording can take a minute.</p>
            <Skeleton lines={8} />
          </Panel>
        )}

        {!tool.loading && result && (
          <Panel className="pop-in">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl bg-white/[0.06] p-1">
                {result.notes && (
                  <button type="button" onClick={() => setTab("notes")}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${tab === "notes" ? "bg-white/10 text-paper" : "text-muted hover:text-paper"}`}>
                    Revision notes
                  </button>
                )}
                <button type="button" onClick={() => setTab("transcript")}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${tab === "transcript" ? "bg-white/10 text-paper" : "text-muted hover:text-paper"}`}>
                  Full transcript
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={body} />
                <Speak text={body} />
                <ExportMenu text={body} title={result.name || "Transcript"} printRef={printRef} />
              </div>
            </div>

            {result.cached && (
              <p className="mb-3 flex items-center gap-1.5 text-xs text-muted"><Icon name="check" size={13} className="text-emerald-300" /> Already transcribed earlier — this did not use an allowance.</p>
            )}
            {!result.notes && (
              <p className="mb-3 text-xs text-lampsoft/80">The transcript is ready, but the notes could not be generated this time. Copy the transcript into Smart Notes to try again.</p>
            )}

            <div ref={printRef}>
              {tab === "transcript"
                ? <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-paper/85">{result.transcript}</p>
                : <Markdown text={result.notes ?? ""} />}
            </div>
          </Panel>
        )}

        {!busy && !result && (
          <Panel className="!p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-paper"><Icon name="mic" size={15} className="text-lamp/80" /> What works best</h2>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>· A phone recording of a lecture, a seminar or your own voice note.</li>
              <li>· Clear speech beats a loud room — background noise costs accuracy.</li>
              <li>· Longer than about 15 minutes? Split it and transcribe each part.</li>
            </ul>
          </Panel>
        )}
      </div>
    </ToolFrame>
  );
}
