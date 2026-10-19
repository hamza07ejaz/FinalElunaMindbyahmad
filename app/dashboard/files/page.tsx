"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DropZone, useAttach, type Attached } from "../../_components/Attach";
import { Icon, type IconName } from "../../_components/Icon";
import { ErrorBox, Panel } from "../../_components/ToolUI";
import { useUsage } from "../../_components/UsageProvider";
import { UpgradeButton } from "../../_components/Upgrade";

type Row = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: "document" | "image" | "audio";
  status: "processing" | "ready" | "failed";
  pages: number | null;
  error: string | null;
  created_at: string;
};

const ICON: Record<Row["kind"], IconName> = { document: "file", image: "image", audio: "mic" };

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function FilesPage() {
  const { usage, plan } = useUsage();
  const attach = useAttach();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const left = Math.max(0, usage.upload.limit - usage.upload.used);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/upload", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login?next=/dashboard/files"; return; }
      if (r.ok) setRows((await r.json()).uploads ?? []);
      else setRows([]);
    } catch { setRows([]); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onPick(f: File) {
    const got: Attached | null = await attach.upload(f);
    await load();                       // show the new row either way
    if (got) attach.clear();            // the list is the record now, no chip needed
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
      if (r.ok) setRows((x) => (x ?? []).filter((row) => row.id !== id));
    } finally { setBusyId(null); }
  }

  return (
    <div className="page-enter mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-9">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-paper"
          style={{ background: "linear-gradient(135deg, #6366f1, #22d3ee)", boxShadow: "0 12px 30px -12px #6366f1" }}>
          <Icon name="folder" size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-paper">My Files</h1>
          <p className="text-sm text-muted">Upload a PDF, Word file, lecture slide, photo of your notes or a recording, then ask the tutor about it.</p>
        </div>
        <span className={`chip ${left === 0 ? "" : "chip-ok"}`} title="Resets daily">{left} of {usage.upload.limit} uploads left today</span>
      </header>

      <Panel>
        {left === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
            <p className="text-sm font-medium text-paper">You have used today&apos;s uploads.</p>
            <p className="mt-1 text-xs text-muted">The allowance resets tomorrow. Files already here still work.</p>
            {plan !== "premium" && <div className="mt-4 flex justify-center"><UpgradeButton label="Get more uploads" className="btn btn-primary btn-sm" /></div>}
          </div>
        ) : (
          <DropZone onPick={(f) => { void onPick(f); }} busy={attach.busy} />
        )}
        <div className="mt-4"><ErrorBox error={attach.error} /></div>
      </Panel>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Your files</h2>

      {rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>
      ) : rows.length === 0 ? (
        <Panel className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-lamp"><Icon name="folder" size={22} /></div>
          <p className="text-sm font-medium text-paper">No files yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">Anything you upload shows up here so you can reuse it in chat or turn it into notes without uploading again.</p>
        </Panel>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="glass pop-in flex flex-wrap items-center gap-3 rounded-2xl p-3.5 sm:flex-nowrap">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.status === "failed" ? "bg-red-500/15 text-red-200" : "bg-white/10 text-lamp"}`}>
                <Icon name={ICON[r.kind] ?? "file"} size={18} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-paper">{r.file_name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {size(r.size_bytes)} · {when(r.created_at)}
                  {r.pages ? ` · ${r.pages} page${r.pages === 1 ? "" : "s"}` : ""}
                  {r.status === "processing" ? " · reading…" : ""}
                  {r.status === "failed" ? ` · could not be read${r.error ? ` (${r.error})` : ""}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {r.status === "ready" && r.kind === "audio" && (
                  <Link href={`/dashboard/transcript?file=${r.id}`} className="btn btn-ghost btn-sm" title="Turn this recording into a transcript">
                    <Icon name="mic" size={14} /> Transcribe
                  </Link>
                )}
                {r.status === "ready" && r.kind !== "audio" && (
                  <>
                    <Link href={`/dashboard/chat?file=${r.id}`} className="btn btn-ghost btn-sm" title="Ask the tutor about this file">
                      <Icon name="chat" size={14} /> Ask
                    </Link>
                    <Link href={`/dashboard/notes?file=${r.id}`} className="btn btn-ghost btn-sm" title="Turn this file into study notes">
                      <Icon name="notes" size={14} /> Notes
                    </Link>
                  </>
                )}
                <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} aria-label={`Delete ${r.file_name}`}
                  className="rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50">
                  {busyId === r.id ? <span className="spinner" /> : <Icon name="trash" size={15} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-mute/80">
        Files are stored privately and only ever read by Eluna to answer your questions. Delete one and both the file and its text are removed.
      </p>
    </div>
  );
}
