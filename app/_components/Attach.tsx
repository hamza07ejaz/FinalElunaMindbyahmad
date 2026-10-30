"use client";
import { useCallback, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { useUsage } from "./UsageProvider";
import { analytics } from "../../lib/analytics";

export type Attached = {
  id: string;
  name: string;
  kind: "document" | "image" | "audio";
  chars?: number;
  pages?: number | null;
};

export const ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xlsm,.epub,.rtf,.txt,.md,.csv,.tsv,.json,.srt,.vtt,.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mpga,.aac,.flac";
/**
 * What the transcriber will actually accept.
 *
 * Video is on this list deliberately: a lecture is far more often a recorded
 * screen share than an audio file, and the sound inside an .mp4 or .webm
 * transcribes exactly as well. Formats the API rejects — .mov, .mkv, .avi —
 * are left off, because accepting a file only to fail it after the upload is
 * worse than not offering it.
 */
export const ACCEPT_AUDIO = ".mp3,.m4a,.wav,.webm,.ogg,.oga,.flac,.mp4,.mpeg,.mpga,.aac";

const ICON_BY_KIND: Record<Attached["kind"], IconName> = { document: "file", image: "image", audio: "mic" };

/** One file's progress while a batch is going up. */
export type QueueItem = {
  name: string;
  status: "waiting" | "reading" | "done" | "failed";
  error?: string;
};

/**
 * How long the browser waits for one upload.
 *
 * Longer than the server's own budget, so in the normal case the server is
 * the one that answers and the message is a real explanation. This is the
 * backstop for the case where no answer arrives at all — a dropped connection,
 * a gateway that gives up, a phone that changed network mid-upload. Without
 * it, fetch waits indefinitely and the spinner never stops, which is what
 * "it hangs" actually looks like from the outside.
 */
const UPLOAD_TIMEOUT_MS = 75_000;

/** Several files at once, but not so many that the server starts refusing them. */
export const MAX_AT_ONCE = 4;

/** One upload, with its own timeout, so no single request can hang for ever. */
async function send(f: File): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("timeout")), UPLOAD_TIMEOUT_MS);
  try {
    const fd = new FormData();
    fd.append("file", f);
    return await fetch("/api/upload", { method: "POST", body: fd, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  // One row per file while several are going up, so a failure is attached to
  // the file it belongs to instead of replacing the whole message.
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const left = Math.max(0, usage.upload.limit - usage.upload.used);

  const upload = useCallback(async (f: File): Promise<Attached | null> => {
    setError(null);
    if (!f) return null;
    if (f.size === 0) { setError("That file is empty."); return null; }
    if (f.size > 25 * 1024 * 1024) {
      /*
       * A video is the common way to be over the limit, and "make it smaller"
       * is not advice anybody can act on. Extracting the sound is: it is what
       * gets transcribed anyway, and it is a fraction of the size.
       */
      const isVideo = f.type.startsWith("video/") || /\.(mp4|mov|mkv|avi|m4v|webm)$/i.test(f.name);
      setError(
        `That file is ${(f.size / 1048576).toFixed(1)} MB and the limit is 25 MB.` +
        (isVideo
          ? " For a video, export just the audio as an MP3 or M4A — that is all that gets transcribed, and it is usually a tenth of the size."
          : " Try a shorter recording, or a smaller file."),
      );
      return null;
    }

    setBusy(true);
    try {
      const res = await send(f);
      if (res.status === 401) { window.location.href = "/login"; return null; }
      /*
       * A body that is not JSON is the gateway's own error page, which is what
       * arrives when the server was killed mid-request. Saying so is far more
       * use than the parse error it used to throw.
       */
      const j = await res.json().catch(() => ({ error: "" }));
      if (!res.ok) {
        setError(j.error || (res.status >= 500
          ? "The server could not finish reading that file. Please try again in a moment."
          : "That file could not be uploaded."));
        return null;
      }
      const att: Attached = { id: j.id, name: j.name, kind: j.kind, chars: j.chars, pages: j.pages };
      // The kind and a size band only. The file name is very often the
      // student's own name and their assignment title.
      analytics.fileUpload(String(j.kind ?? "document"), f.size);
      setFile(att);
      return att;
    } catch (err) {
      setError((err as Error)?.name === "AbortError" || (err as Error)?.message === "timeout"
        ? "That upload took too long and was stopped. Try a smaller file, or one at a time."
        : "Upload failed. Please check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
      refresh(); // the upload counted against today's allowance
    }
  }, [refresh]);

  const clear = useCallback(() => { setFile(null); setError(null); setQueue([]); }, []);

  /*
   * Several files, two at a time.
   *
   * Two rather than all four on purpose. The server reads a couple of files at
   * once per instance and asks the rest to wait, so firing four together wins
   * nothing and risks two of them being told the server is busy. Two keeps
   * every request doing real work, and the next one starts the moment one
   * finishes — so four files take about as long as two, not four times as long.
   *
   * One file failing never stops the others: each result is reported on its
   * own row, because "three of your four files are ready" is a far better
   * answer than one error standing in for all of them.
   */
  const uploadMany = useCallback(async (files: File[]): Promise<Attached[]> => {
    const picked = files.slice(0, MAX_AT_ONCE);
    if (!picked.length) return [];
    if (picked.length === 1) {
      const one = await upload(picked[0]);
      return one ? [one] : [];
    }

    setError(null);
    setBusy(true);
    setQueue(picked.map((f) => ({ name: f.name, status: "waiting" as const })));

    const done: Attached[] = [];
    let next = 0;

    const mark = (i: number, patch: Partial<QueueItem>) =>
      setQueue((q) => q.map((item, j) => (j === i ? { ...item, ...patch } : item)));

    const worker = async () => {
      for (;;) {
        const i = next++;
        if (i >= picked.length) return;
        const f = picked[i];
        mark(i, { status: "reading" });
        try {
          const res = await send(f);
          if (res.status === 401) { window.location.href = "/login"; return; }
          const j = await res.json().catch(() => ({ error: "" }));
          if (res.ok) {
            done.push({ id: j.id, name: j.name, kind: j.kind, chars: j.chars, pages: j.pages });
            analytics.fileUpload(String(j.kind ?? "document"), f.size);
            mark(i, { status: "done" });
          } else {
            mark(i, {
              status: "failed",
              error: j.error || (res.status >= 500 ? "The server could not finish this one." : "This file could not be read."),
            });
          }
        } catch (err) {
          mark(i, {
            status: "failed",
            error: (err as Error)?.name === "AbortError" || (err as Error)?.message === "timeout"
              ? "Took too long and was stopped."
              : "Upload failed — check your connection.",
          });
        }
      }
    };

    try {
      await Promise.all([worker(), worker()]);
    } finally {
      setBusy(false);
      refresh();
    }
    return done;
  }, [upload, refresh]);

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

  return { file, busy, error, left, queue, upload, uploadMany, adopt, clear, setError, setFile };
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

/**
 * A drop zone for the tool pages, where there is room for one.
 *
 * `multiple` is opt-in: the tools take one file because they work on one file,
 * while My Files takes several because that is where a stack of lecture notes
 * gets uploaded.
 */
export function DropZone({
  onPick, onPickMany, busy, multiple = false, accept = ACCEPT,
  hint = "PDF, Word, PowerPoint, Excel, EPUB, text, image or audio · up to 25 MB",
}: {
  onPick?: (f: File) => void;
  /** Called instead of onPick when several files arrive at once. */
  onPickMany?: (f: File[]) => void;
  busy?: boolean; multiple?: boolean; accept?: string; hint?: string;
}) {
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  /**
   * @param list already copied out of the input — see the note on the input below.
   */
  const hand = (list: File[]) => {
    const files = list.slice(0, multiple ? MAX_AT_ONCE : 1);
    if (!files.length) return;
    if (onPickMany) onPickMany(files);
    else onPick?.(files[0]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        hand(Array.from(e.dataTransfer.files ?? []));
      }}
      onClick={() => !busy && ref.current?.click()}
      className={`cursor-pointer rounded-2xl border border-dashed p-6 text-center transition ${
        over ? "border-violet-400/70 bg-violet-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.03]"
      }`}
    >
      {/*
        Copy the files out before clearing the input.

        `input.files` is live: resetting `value` — which is what lets the same
        file be chosen twice in a row — empties the very list being held. Done
        in the wrong order, every file chosen by clicking vanished before it
        was read, and only drag-and-drop still worked.
      */}
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          hand(files);
        }} />
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-lamp">
        {busy ? <span className="spinner" /> : <Icon name="attach" size={20} />}
      </div>
      <p className="text-sm font-medium text-paper">
        {busy ? "Reading your files…" : multiple ? `Drop files here, or click to choose` : "Drop a file here, or click to choose"}
      </p>
      <p className="mt-1 text-xs text-muted">{hint}{multiple ? ` · up to ${MAX_AT_ONCE} at a time` : ""}</p>
    </div>
  );
}
