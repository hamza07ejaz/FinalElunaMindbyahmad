"use client";
import { useCallback, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { useUsage } from "./UsageProvider";

export type Attached = {
  id: string;
  name: string;
  kind: "document" | "image" | "audio";
  chars?: number;
  pages?: number | null;
};

export const ACCEPT = ".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.gif,.mp3,.m4a,.wav,.webm,.ogg";
export const ACCEPT_AUDIO = ".mp3,.m4a,.wav,.webm,.ogg,.mp4,.mpga";

const ICON_BY_KIND: Record<Attached["kind"], IconName> = { document: "file", image: "image", audio: "mic" };

/**
 * One upload, shared by the chat box, the notes tool and the transcript tool.
 * The server does the real validation; the checks here only save a wasted
 * round trip and give the student a faster answer.
 */
export function useAttach() {
  const { refresh, usage } = useUsage();
  const [file, setFile] = useState<Attached | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(0, usage.upload.limit - usage.upload.used);

  const upload = useCallback(async (f: File): Promise<Attached | null> => {
    setError(null);
    if (!f) return null;
    if (f.size === 0) { setError("That file is empty."); return null; }
    if (f.size > 25 * 1024 * 1024) {
      setError(`That file is ${(f.size / 1048576).toFixed(1)} MB. The largest we accept is 25 MB.`);
      return null;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.status === 401) { window.location.href = "/login"; return null; }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "That file could not be uploaded.");
        return null;
      }
      const att: Attached = { id: j.id, name: j.name, kind: j.kind, chars: j.chars, pages: j.pages };
      setFile(att);
      return att;
    } catch {
      setError("Upload failed. Please check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
      refresh(); // the upload counted against today's allowance
    }
  }, [refresh]);

  const clear = useCallback(() => { setFile(null); setError(null); }, []);

  /** Re-attach a file already in My Files (used by the ?file=<id> links). */
  const adopt = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/uploads/${id}`, { cache: "no-store" });
      if (!r.ok) { setError("That file is no longer available."); return null; }
      const j = await r.json();
      if (j.status !== "ready") { setError("That file is still being read. Try again in a moment."); return null; }
      const att: Attached = { id: j.id, name: j.name, kind: j.kind, chars: (j.text ?? "").length, pages: j.pages };
      setFile(att);
      return att;
    } catch {
      setError("Could not open that file.");
      return null;
    } finally { setBusy(false); }
  }, []);

  return { file, busy, error, left, upload, adopt, clear, setError, setFile };
}

/** The paperclip. Hides the real input so the control can be styled. */
export function AttachButton({
  onPick, busy, disabled, accept = ACCEPT, label, className = "btn btn-ghost h-11 w-11 shrink-0 !p-0",
}: {
  onPick: (f: File) => void; busy?: boolean; disabled?: boolean; accept?: string; label?: string; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // so picking the same file twice still fires
          if (f) onPick(f);
        }}
      />
      <button
        type="button" className={className} disabled={busy || disabled}
        onClick={() => ref.current?.click()}
        aria-label={label ?? "Attach a file"} title={label ?? "Attach a PDF, Word file, image or recording"}
      >
        {busy ? <span className="spinner" /> : <Icon name="attach" size={18} />}
        {label && <span>{label}</span>}
      </button>
    </>
  );
}

/** The chip shown once a file is attached, so it is obvious what the AI is reading. */
export function AttachedChip({ file, onClear, note }: { file: Attached; onClear: () => void; note?: string }) {
  const detail = note
    ?? (file.kind === "audio" ? "ready to transcribe"
      : file.pages ? `${file.pages} page${file.pages === 1 ? "" : "s"} read`
      : file.chars ? `${file.chars.toLocaleString()} characters read`
      : "read");
  return (
    <div className="pop-in mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
      <Icon name={ICON_BY_KIND[file.kind]} size={16} className="shrink-0 text-lamp" />
      <span className="min-w-0 flex-1 truncate text-sm text-paper/85">{file.name}</span>
      <span className="hidden shrink-0 text-xs text-muted sm:inline">{detail}</span>
      <button type="button" onClick={onClear} aria-label="Remove file"
        className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-white/10 hover:text-paper">
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

/** A drop zone for the tool pages, where there is room for one. */
export function DropZone({
  onPick, busy, accept = ACCEPT, hint = "PDF, Word, text, image or audio · up to 25 MB",
}: { onPick: (f: File) => void; busy?: boolean; accept?: string; hint?: string }) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      onClick={() => !busy && ref.current?.click()}
      className={`cursor-pointer rounded-2xl border border-dashed p-6 text-center transition ${
        over ? "border-violet-400/70 bg-violet-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]"
      }`}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-lamp">
        {busy ? <span className="spinner" /> : <Icon name="attach" size={20} />}
      </div>
      <p className="text-sm font-medium text-paper">{busy ? "Reading your file…" : "Drop a file here, or click to choose"}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}
