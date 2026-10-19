"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachButton, AttachedChip, useAttach } from "../../_components/Attach";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { ExportMenu } from "../../_components/ExportMenu";
import { Speak } from "../../_components/Speak";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Item = { id: string; title: string; created_at: string };

export default function NotesPage() {
  const tool = useToolRunner<{ notes: string; id?: string }>("/api/generate");
  const attach = useAttach();
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<Item[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try { const r = await fetch("/api/notes"); if (r.ok) setHistory((await r.json()).notes ?? []); } catch { /* offline */ }
  }, []);

  const open = useCallback(async (id: string) => {
    const r = await fetch(`/api/notes/${id}`);
    if (!r.ok) return;
    const j = await r.json();
    setResult(j.note.content); setActiveId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    loadHistory();
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("id"), file = sp.get("file");
    if (id) open(id);
    if (file) { window.history.replaceState(null, "", "/dashboard/notes"); void attach.adopt(file); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadHistory, open]);

  async function generate() {
    const j = await tool.run({ text, uploadId: attach.file?.id ?? null });
    if (j) { setResult(j.notes); setActiveId(j.id ?? null); loadHistory(); }
  }
  async function remove(id: string) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setHistory((h) => h.filter((x) => x.id !== id));
    if (activeId === id) { setResult(""); setActiveId(null); }
  }

  return (
    <ToolFrame toolKey="notes" wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-5">
          <Panel>
            {attach.file && (
              <AttachedChip
                file={attach.file} onClear={attach.clear}
                note={attach.file.pages ? `${attach.file.pages} pages · notes will come from this file` : "notes will come from this file"}
              />
            )}
            <Field
              label={attach.file ? "Anything specific you want from this file? (optional)" : "Paste your text or describe a topic"}
              hint={`${text.length}/8000`}
            >
              <textarea className="input" rows={attach.file ? 3 : 6} maxLength={8000} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={attach.file ? "e.g. Focus on chapter 3 only, or: make it exam-ready" : "e.g. Paste a lecture, a chapter, or write: 'The causes of World War 1'"} />
            </Field>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <GenerateButton loading={tool.loading} disabled={!text.trim() && !attach.file} onClick={generate} label="Generate notes" />
              {!attach.file && (
                <AttachButton
                  onPick={(f) => { void attach.upload(f); }} busy={attach.busy} disabled={attach.left === 0}
                  label="Use a file instead" className="btn btn-ghost"
                />
              )}
              {attach.left === 0 && !attach.file && <span className="text-xs text-muted">No uploads left today</span>}
            </div>
          </Panel>
          <ErrorBox error={tool.error || attach.error} upgrade={tool.upgrade} />
          {tool.loading && <Panel><Skeleton lines={8} /></Panel>}
          {!tool.loading && result && (
            <Panel className="pop-in">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="chip chip-ok"><Icon name="check" size={12} /> Saved to history</span>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={result} />
                  <Speak text={result} />
                  <ExportMenu text={result} title={history.find((h) => h.id === activeId)?.title || "Notes"} printRef={printRef} />
                </div>
              </div>
              <div ref={printRef}><Markdown text={result} /></div>
            </Panel>
          )}
        </div>

        <aside>
          <Panel className="!p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-paper"><Icon name="history" size={16} className="text-lamp/80" /> Notes history</h2>
            {history.length === 0 ? <p className="py-3 text-sm text-muted">Generated notes are saved here automatically.</p> : (
              <ul className="space-y-0.5">
                {history.map((n) => (
                  <li key={n.id} className={`group flex items-center rounded-lg pr-1 ${activeId === n.id ? "bg-white/10" : "hover:bg-white/5"}`}>
                    <button type="button" onClick={() => open(n.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                      <span className="block truncate text-sm text-paper/85">{n.title}</span>
                      <span className="text-[0.68rem] text-muted">{new Date(n.created_at).toLocaleDateString()}</span>
                    </button>
                    <button type="button" aria-label="Delete note" onClick={() => remove(n.id)} className="rounded-md p-1.5 text-muted opacity-0 transition hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"><Icon name="trash" size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </ToolFrame>
  );
}
