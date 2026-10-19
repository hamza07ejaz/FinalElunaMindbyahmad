"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../_components/Icon";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";
import { DECK_THEMES, downloadPptx, type DeckTheme, type Slide } from "../../../lib/export/pptx";

export default function PresentationPage() {
  const tool = useToolRunner<{ slides: Slide[] }>("/api/generate-presentation");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [audience, setAudience] = useState("students");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [i, setI] = useState(0);
  const [edit, setEdit] = useState(false);
  const [theme, setTheme] = useState<DeckTheme>(DECK_THEMES[0]);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const stage = useRef<HTMLDivElement>(null);

  async function generate() {
    const j = await tool.run({ topic, slides: count, audience });
    if (j) { setSlides(j.slides); setI(0); setEdit(false); setExportErr(""); }
  }

  const go = useCallback((d: number) => setI((x) => Math.min(Math.max(x + d, 0), Math.max(slides.length - 1, 0))), [slides.length]);
  useEffect(() => {
    if (!slides.length) return;
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [slides.length, go]);

  const cur = slides[i];
  const upd = (p: Partial<Slide>) => setSlides((s) => s.map((x, k) => (k === i ? { ...x, ...p } : x)));

  function addSlide() {
    setSlides((s) => { const n = [...s]; n.splice(i + 1, 0, { title: "New slide", bullets: ["Point one"], notes: "" }); return n; });
    setI((x) => x + 1); setEdit(true);
  }
  function removeSlide() {
    if (slides.length <= 1) return;
    setSlides((s) => s.filter((_, k) => k !== i));
    setI((x) => Math.max(0, x - 1));
  }

  async function exportPptx() {
    setExporting(true); setExportErr("");
    try {
      await downloadPptx(slides, topic, theme);
    } catch (e) {
      console.error("pptx export failed:", e);
      setExportErr("The download could not be built. Try again, or copy the text instead.");
    } finally { setExporting(false); }
  }

  return (
    <ToolFrame toolKey="presentation" wide>
      <div className="space-y-5">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-[1fr_170px_170px]">
            <Field label="Presentation topic" hint={`${topic.length}/300`}>
              <input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && topic.trim() && generate()} placeholder="e.g. Renewable energy sources" />
            </Field>
            <Field label="Audience">
              <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="students">Students</option>
                <option value="a general audience">General</option>
                <option value="professionals">Professionals</option>
                <option value="a technical audience">Technical</option>
              </select>
            </Field>
            <Field label={`Slides: ${count}`}>
              <input type="range" min={5} max={12} value={count} onChange={(e) => setCount(+e.target.value)} className="mt-3 w-full accent-amber-400" />
            </Field>
          </div>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Generate slides" /></div>
        </Panel>

        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={7} /></Panel>}

        {!tool.loading && cur && (
          <div className="pop-in space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">Slide {i + 1} of {slides.length}</span>
                <button type="button" onClick={addSlide} className="btn btn-ghost btn-sm" title="Add a slide after this one"><Icon name="plus" size={14} /></button>
                <button type="button" onClick={removeSlide} disabled={slides.length <= 1} className="btn btn-ghost btn-sm" title="Delete this slide"><Icon name="trash" size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit((v) => !v)}>
                  <Icon name="edit" size={14} /> {edit ? "Done" : "Edit"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => stage.current?.requestFullscreen?.()}>
                  <Icon name="expand" size={14} /> Present
                </button>
                <CopyButton label="Copy text" text={slides.map((s, k) => `Slide ${k + 1}: ${s.title}\n${s.bullets.map((b) => `• ${b}`).join("\n")}`).join("\n\n")} />
                <button type="button" className="btn btn-primary btn-sm" onClick={exportPptx} disabled={exporting}>
                  {exporting ? <><span className="spinner" /> Building…</> : <><Icon name="download" size={14} /> PowerPoint</>}
                </button>
              </div>
            </div>

            {/* theme picker */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Theme</span>
              {DECK_THEMES.map((t) => (
                <button key={t.name} type="button" onClick={() => setTheme(t)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${theme.name === t.name ? "border-violet-400/60 bg-violet-500/10 text-paper" : "border-white/10 text-muted hover:text-paper"}`}>
                  <span className="flex gap-0.5">
                    <span className="h-3 w-3 rounded-sm" style={{ background: `#${t.bg}` }} />
                    <span className="h-3 w-3 rounded-sm" style={{ background: `#${t.accent}` }} />
                  </span>
                  {t.name}
                </button>
              ))}
            </div>

            {exportErr && <ErrorBox error={exportErr} />}

            <div ref={stage} className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 p-[5%]"
              style={{ background: `#${i === 0 ? (theme.titleBg ?? theme.bg) : theme.bg}` }}>
              {edit ? (
                <div className="relative h-full space-y-3 overflow-y-auto">
                  <input className="input !text-lg" value={cur.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Slide title" />
                  <textarea className="input" rows={6} value={cur.bullets.join("\n")} onChange={(e) => upd({ bullets: e.target.value.split("\n") })} placeholder="One bullet per line" />
                  <textarea className="input !min-h-0" rows={2} value={cur.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })} placeholder="Speaker notes (optional)" />
                </div>
              ) : (
                <div key={i} className="page-enter relative flex h-full flex-col justify-center">
                  <h2 className={i === 0 ? "text-[clamp(1.4rem,4.5vw,3rem)] font-semibold leading-tight" : "mb-[2%] text-[clamp(1.1rem,3vw,2.1rem)] font-semibold leading-tight"}
                    style={{ color: `#${theme.title}`, fontFamily: "var(--font-fraunces), Georgia, serif" }}>
                    {cur.title}
                  </h2>
                  <span className="mb-[3%] block h-[3px] w-[9%] rounded-full" style={{ background: `#${theme.accent}` }} />
                  <ul className={i === 0 ? "text-[clamp(.75rem,1.7vw,1.15rem)]" : "list-disc space-y-[1.1%] pl-[4%] text-[clamp(.78rem,1.9vw,1.3rem)]"}
                    style={{ color: `#${theme.body}` }}>
                    {cur.bullets.filter(Boolean).map((b, k) => <li key={k} className={i === 0 ? "list-none" : ""} style={{ ["--tw-prose-bullets" as string]: `#${theme.accent}` }}>{b}</li>)}
                  </ul>
                  {i > 0 && <span className="absolute bottom-0 right-0 text-xs" style={{ color: `#${theme.accent}` }}>{i + 1}</span>}
                </div>
              )}
            </div>

            {cur.notes && !edit && (
              <Panel className="!p-4">
                <p className="mb-1 text-xs text-muted">Speaker notes</p>
                <p className="text-sm leading-relaxed text-paper/80">{cur.notes}</p>
              </Panel>
            )}

            <div className="flex items-center justify-between gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => go(-1)} disabled={i === 0}>
                <span className="rotate-180"><Icon name="chevron" size={16} /></span> Prev
              </button>
              <div className="flex max-w-[55%] gap-1.5 overflow-x-auto py-1">
                {slides.map((_, k) => (
                  <button key={k} type="button" aria-label={`Go to slide ${k + 1}`} onClick={() => setI(k)}
                    className={`h-2 shrink-0 rounded-full transition-all ${k === i ? "w-6 bg-lamp" : "w-2 bg-white/20 hover:bg-white/40"}`} />
                ))}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => go(1)} disabled={i === slides.length - 1}>
                Next <Icon name="chevron" size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
