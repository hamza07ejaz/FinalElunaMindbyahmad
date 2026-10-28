"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../_components/Icon";
import { CopyButton, ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";
import { DECK_THEMES, downloadPptx, resolveLayout, type DeckTheme, type Slide } from "../../../lib/export/pptx";
import { SlideView } from "./SlideView";

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

  // What this installation can actually offer. Asked once, so the switch below
  // is never shown on a site with no stock key configured.
  const [can, setCan] = useState<{ stock: boolean; ai: boolean; max: number; reason?: string }>({ stock: false, ai: false, max: 0 });
  const [useAi, setUseAi] = useState(false);
  const [imgState, setImgState] = useState<"idle" | "loading" | "done">("idle");
  const [imgNote, setImgNote] = useState("");

  useEffect(() => {
    fetch("/api/slide-images", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setCan({ stock: !!j.stock, ai: !!j.ai, max: j.max ?? 0, reason: j.reason }); })
      .catch(() => { /* pictures are optional; the tool works without them */ });
  }, []);

  /**
   * Fetch the pictures after the deck is already on screen.
   *
   * Separate from generating the slides on purpose: the words are what the
   * student is waiting for, and making them watch a second spinner for
   * decoration would be the wrong trade. If this fails, the deck simply stays
   * as text — every image layout falls back to bullets on its own.
   */
  const fetchImages = useCallback(async (deck: Slide[], ai: boolean) => {
    const asks = deck
      .map((s, index) => ({ index, query: s.imageQuery ?? "" }))
      .filter((a) => a.query.trim().length > 1);
    if (!asks.length) return;

    setImgState("loading"); setImgNote("");
    try {
      const r = await fetch("/api/slide-images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: asks, mode: ai ? "ai" : "stock" }),
      });
      const j = await r.json();
      if (Array.isArray(j?.images) && j.images.length) {
        setSlides((cur) => {
          const next = [...cur];
          for (const { index, image } of j.images as { index: number; image: Slide["image"] }[]) {
            if (next[index]) next[index] = { ...next[index], image };
          }
          return next;
        });
      }
      if (j?.note) setImgNote(String(j.note));
    } catch {
      setImgNote("Pictures could not be fetched. The deck is fine without them.");
    } finally {
      setImgState("done");
    }
  }, []);

  async function generate() {
    const j = await tool.run({ topic, slides: count, audience });
    if (j) {
      setSlides(j.slides); setI(0); setEdit(false); setExportErr(""); setImgState("idle"); setImgNote("");
      if (can.stock || can.ai) void fetchImages(j.slides, useAi && can.ai);
      // Nothing configured. Say so to whoever can fix it rather than producing
      // a picture-less deck in silence and leaving them to guess.
      else if (can.reason) setImgNote(can.reason);
    }
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

  // Cover and section slides sit on the deeper background, the way they do in
  // the exported file. Asking the exporter which layout a slide got keeps the
  // two in step instead of guessing from the index.
  const coverish = (s: Slide, k: number) => {
    const l = resolveLayout(s, k, slides.length);
    return l === "cover" || l === "section";
  };

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
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Generate slides" />
            {can.ai && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="accent-violet-400" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                Generate the pictures with AI
                <span className="text-xs opacity-70">(slower, more on-topic)</span>
              </label>
            )}
          </div>
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

            {imgState === "loading" && (
              <p role="status" className="flex items-center gap-2 text-xs text-muted">
                <span className="spinner" /> Finding pictures… the deck is ready to read meanwhile.
              </p>
            )}
            {imgNote && <p className="text-xs text-muted">{imgNote}</p>}
            {exportErr && <ErrorBox error={exportErr} />}

            <div ref={stage} className={`relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 ${edit ? "p-[5%]" : ""}`}
              style={{ background: `#${coverish(cur, i) ? (theme.titleBg ?? theme.bg) : theme.bg}` }}>
              {edit ? (
                <div className="relative h-full space-y-3 overflow-y-auto">
                  <input className="input !text-lg" value={cur.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Slide title" />
                  <textarea className="input" rows={6} value={cur.bullets.join("\n")} onChange={(e) => upd({ bullets: e.target.value.split("\n") })} placeholder="One bullet per line" />
                  <textarea className="input !min-h-0" rows={2} value={cur.notes ?? ""} onChange={(e) => upd({ notes: e.target.value })} placeholder="Speaker notes (optional)" />
                </div>
              ) : (
                <div key={i} className="page-enter h-full">
                  <SlideView slide={cur} index={i} total={slides.length} theme={theme} />
                  {i > 0 && (
                    <span className="absolute bottom-[2.5%] right-[3%] text-xs" style={{ color: `#${theme.accent}` }}>{i + 1}</span>
                  )}
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
