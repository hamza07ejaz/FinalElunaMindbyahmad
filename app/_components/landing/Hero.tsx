"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import type { HeroContent } from "../../../lib/content";

/**
 * The hero.
 *
 * The mark is two hemispheres with light at the seam, so the hero is built the
 * same way: the raw material a student actually has on the left, what they get
 * back on the right, and a lit seam between them. That one image is the whole
 * product, which is why it leads rather than a headline over a gradient.
 *
 * The right-hand side plays through the three outputs on a slow loop. That is
 * the page's single piece of autonomous motion; everything below only moves in
 * answer to something the person did.
 */

type Stage = { label: string; icon: "notes" | "map" | "test"; render: () => React.ReactNode };

const DOCUMENT_LINES = [78, 94, 66, 88, 52, 91, 71, 84, 60];

function RawSide() {
  return (
    <div className="relative h-full p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon name="file" size={13} />
        <span className="truncate">thermodynamics_lecture_7.pdf</span>
        <span className="ml-auto shrink-0">14 pages</span>
      </div>

      {/* A page of text nobody has read yet. Grey, dense, slightly skewed — it
          should feel like a chore, because that is the problem being solved. */}
      <div className="mt-4 space-y-2.5 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]">
        <div className="h-2.5 w-2/5 rounded-full bg-white/20" />
        <div className="h-px w-full bg-white/10" />
        {DOCUMENT_LINES.map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-white/[0.085]" style={{ width: `${w}%` }} />
        ))}
      </div>

      <div className="absolute inset-x-5 bottom-5 flex flex-wrap gap-1.5 sm:inset-x-6 sm:bottom-6">
        <span className="chip !text-[0.68rem]"><Icon name="image" size={11} /> 3 diagrams</span>
        <span className="chip !text-[0.68rem]"><Icon name="mic" size={11} /> 48 min audio</span>
      </div>
    </div>
  );
}

function NotesOutput() {
  return (
    <div className="space-y-3">
      <p className="font-display text-[0.95rem] font-semibold text-paper">The second law, in one line</p>
      <p className="text-[0.82rem] leading-relaxed text-paper/75">
        Entropy of an isolated system never decreases. Heat will not move from cold to hot on its own.
      </p>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
        <p className="text-center font-mono text-[0.82rem] text-lampsoft">ΔS<sub>universe</sub> ≥ 0</p>
      </div>
      <ul className="space-y-1.5 text-[0.8rem] text-paper/70">
        {["Reversible process: ΔS = 0", "Every real process: ΔS > 0", "Why a fridge needs plugging in"].map((t) => (
          <li key={t} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-s2" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

function MapOutput() {
  const branches = [
    { label: "Entropy", x: 18, y: 26, c: "var(--s1)" },
    { label: "Heat engines", x: 76, y: 22, c: "var(--s2)" },
    { label: "Carnot cycle", x: 80, y: 72, c: "var(--s4)" },
    { label: "Free energy", x: 20, y: 76, c: "var(--s5)" },
  ];
  return (
    <div className="relative h-[13.5rem]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {branches.map((b) => (
          <line key={b.label} x1="50" y1="50" x2={b.x} y2={b.y} stroke={b.c} strokeWidth="0.5" strokeOpacity="0.5" />
        ))}
      </svg>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-[#10152b] px-3 py-1.5 text-[0.78rem] font-medium text-paper">
        Second law
      </span>
      {branches.map((b) => (
        <span key={b.label}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.72rem] text-paper/85"
          style={{ left: `${b.x}%`, top: `${b.y}%`, borderColor: b.c, background: "rgba(10,13,28,.9)" }}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function TestOutput() {
  const options = [
    { t: "It always increases", ok: false },
    { t: "It never decreases in an isolated system", ok: true },
    { t: "It is conserved", ok: false },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[0.7rem] text-muted">Question 2 of 10</p>
      <p className="text-[0.88rem] font-medium leading-snug text-paper">What does the second law say about entropy?</p>
      <ul className="space-y-1.5">
        {options.map((o) => (
          <li key={o.t}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[0.8rem] ${
              o.ok ? "border-mint/40 bg-mint/10 text-mint" : "border-white/10 bg-white/[0.03] text-paper/70"
            }`}>
            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${o.ok ? "border-mint" : "border-white/25"}`}>
              {o.ok && <Icon name="check" size={10} />}
            </span>
            {o.t}
          </li>
        ))}
      </ul>
    </div>
  );
}

const STAGES: Stage[] = [
  { label: "Study notes", icon: "notes", render: () => <NotesOutput /> },
  { label: "Mind map", icon: "map", render: () => <MapOutput /> },
  { label: "Practice test", icon: "test", render: () => <TestOutput /> },
];

export function Hero({ c }: { c: HeroContent }) {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const figureRef = useRef<HTMLDivElement>(null);

  // One slow loop, pausable. It stops entirely for reduced motion, and while
  // the tab is hidden there is no point burning a timer.
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || paused) return;
    const id = setInterval(() => {
      if (!document.hidden) setStage((s) => (s + 1) % STAGES.length);
    }, 4200);
    return () => clearInterval(id);
  }, [paused]);

  // The seam catches the pointer: a soft highlight tracks it across the figure.
  useEffect(() => {
    const el = figureRef.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);

  const headline = splitAccent(c.headline, c.accent);
  const hasVideo = !!c.videoUrl;

  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 sm:pt-40">
      <div className="aurora" />

      <div className="relative mx-auto max-w-3xl text-center">
        <p className="chip chip-brand mb-7">{c.eyebrow}</p>
        <h1 className="text-balance text-[2.5rem] leading-[1.06] sm:text-[3.6rem] lg:text-[4.1rem]">
          {headline.before}
          {headline.accent && <span className="sweep-text">{headline.accent}</span>}
          {headline.after}
        </h1>
        <p className="lede mx-auto mt-6 text-pretty text-[1.05rem] sm:text-lg">{c.subline}</p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login?mode=signup&next=/dashboard" className="btn btn-primary !px-7 !py-3.5 text-base">
            {c.primaryCta}
          </Link>
          <Link href="/#how" className="btn btn-ghost !px-6 !py-3.5 text-base">{c.secondaryCta}</Link>
        </div>
        <p className="mt-5 text-sm text-muted">{c.reassurance}</p>
      </div>

      {/* ---------------- the seam ---------------- */}
      <div ref={figureRef}
        className="hemi relative mx-auto mt-16 max-w-5xl rounded-[1.75rem] sm:mt-20"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        {hasVideo ? (
          <div className="relative aspect-video overflow-hidden rounded-[1.75rem]">
            {/* Above the fold, so no lazy loading: it would delay the poster too. */}
            <video
              className="h-full w-full object-cover"
              src={c.videoUrl}
              poster={c.videoPoster || undefined}
              autoPlay muted loop playsInline preload="metadata"
            />
          </div>
        ) : (
          <div className="relative">
            {/* The seam sits outside the grid on purpose. An absolutely
                positioned grid child is placed against its grid AREA, not the
                grid container, so inside the grid "left: 50%" lands in the
                middle of the right-hand column instead of the middle of the card. */}
            <div className="seam absolute left-1/2 hidden w-px md:block" style={{ top: "6%", bottom: "6%" }} aria-hidden="true">
              <span className="seam-spark" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2">
            {/* left: what they were given */}
            <div className="relative border-b border-white/[0.07] md:border-b-0">
              <p className="px-5 pt-5 text-[0.7rem] uppercase tracking-[0.14em] text-mute/70 sm:px-6">{c.beforeLabel}</p>
              <div className="min-h-[15rem]"><RawSide /></div>
            </div>

            <div className="seam-h md:hidden" aria-hidden="true" />

            {/* right: what they get back */}
            <div className="relative">
              <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                <p className="text-[0.7rem] uppercase tracking-[0.14em] text-mute/70">{c.afterLabel}</p>
                {/*
                  The dots stay 6px because that is the right size to look at.
                  The button around each one is 24px tall with padding, because
                  6×6 is the right size to miss: it is a quarter of the minimum
                  anyone can reliably hit with a thumb. The visible dot is the
                  inner span; the padding is invisible and does the work.
                */}
                <div className="-my-2 flex" role="tablist" aria-label="Output">
                  {STAGES.map((s, i) => (
                    <button key={s.label} type="button" role="tab" aria-selected={i === stage} aria-label={s.label}
                      onClick={() => { setStage(i); setPaused(true); }}
                      className="group flex h-6 min-w-6 items-center justify-center">
                      <span className={`block h-1.5 rounded-full transition-all duration-300 ${
                        i === stage ? "w-6 bg-lamp" : "w-1.5 bg-white/20 group-hover:bg-white/40"
                      }`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-[15rem] px-5 pb-6 pt-4 sm:px-6">
                <p className="mb-3 flex items-center gap-2 text-xs text-lampsoft">
                  <Icon name={STAGES[stage].icon} size={13} /> {STAGES[stage].label}
                </p>
                {/* keyed so each output fades in as itself rather than morphing */}
                <div key={stage} className="page-enter">{STAGES[stage].render()}</div>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Split a headline around the phrase that should carry the spectrum. */
function splitAccent(headline: string, accent: string) {
  if (!accent) return { before: headline, accent: "", after: "" };
  const i = headline.indexOf(accent);
  if (i < 0) return { before: headline, accent: "", after: "" };
  return { before: headline.slice(0, i), accent, after: headline.slice(i + accent.length) };
}
