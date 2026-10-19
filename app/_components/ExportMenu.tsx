"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { downloadDocx, downloadMarkdown, downloadText, printElement } from "../../lib/export/docs";

/** Download / print menu for any generated text. `printRef` points at the rendered output. */
export function ExportMenu({ text, title, printRef }:
  { text: string; title: string; printRef?: React.RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function run(kind: "docx" | "pdf" | "md" | "txt") {
    setErr(""); setBusy(kind);
    try {
      if (kind === "docx") await downloadDocx(text, title);
      else if (kind === "md") downloadMarkdown(text, title);
      else if (kind === "txt") downloadText(text, title);
      else if (!printElement(printRef?.current ?? null, title))
        setErr("Your browser blocked the print window. Allow pop-ups for this site and try again.");
      if (kind !== "pdf") setOpen(false);
    } catch (e) {
      console.error("export failed:", e);
      setErr("That download could not be built. Try another format.");
    } finally { setBusy(""); }
  }

  const items: { k: "docx" | "pdf" | "md" | "txt"; label: string; hint: string }[] = [
    { k: "docx", label: "Word (.docx)", hint: "Headings and lists kept" },
    { k: "pdf", label: "PDF", hint: "Opens your print dialog" },
    { k: "md", label: "Markdown (.md)", hint: "For Notion or Obsidian" },
    { k: "txt", label: "Plain text (.txt)", hint: "Anywhere" },
  ];

  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="download" size={14} /> Download
      </button>
      {open && (
        <div role="menu" className="pop-in glass-strong absolute right-0 z-20 mt-2 w-60 rounded-xl p-1.5">
          {items.map((it) => (
            <button key={it.k} role="menuitem" type="button" disabled={!!busy} onClick={() => run(it.k)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-50">
              <span className="flex-1">
                <span className="block text-sm text-paper">{it.label}</span>
                <span className="block text-xs text-muted">{it.hint}</span>
              </span>
              {busy === it.k && <span className="spinner" />}
            </button>
          ))}
          {err && <p className="px-3 py-2 text-xs text-red-300">{err}</p>}
        </div>
      )}
    </div>
  );
}
