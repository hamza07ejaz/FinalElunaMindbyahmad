"use client";
import Link from "next/link";
import { useRef } from "react";
import { Icon, type IconName } from "../Icon";
import type { FeatureItem, SectionIntro, StepItem } from "../../../lib/content";

/**
 * The sections below the hero.
 *
 * The hero is where the boldness is spent, so everything here is quiet: one
 * hairline seam between sections, type doing the work, and motion only in
 * answer to a pointer. No card kit — the feature grid is built from the mark's
 * split rather than from identical rounded boxes.
 *
 * Nothing here fades in on scroll. Two reasons: a fade-up on every section is
 * the look every generated page has, and it puts the content behind an
 * IntersectionObserver — if that never fires, the page is permanently blank
 * where the words should be. The copy renders, full stop.
 */

export function SectionHead({ intro, center = false }: { intro: SectionIntro; center?: boolean }) {
  return (
    <div className={`mb-12 max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      <p className="mb-3 text-sm text-lampsoft">{intro.kicker}</p>
      <h2 className="text-balance text-3xl sm:text-[2.6rem]">{intro.title}</h2>
      {intro.sub && <p className={`lede mt-4 ${center ? "mx-auto" : ""}`}>{intro.sub}</p>}
    </div>
  );
}

export function Seam() {
  return <div className="seam-h mx-auto max-w-6xl" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* What it reads — a strip, not a section. It answers "will it take     */
/* MY file?" which is the first objection.                              */
/* ------------------------------------------------------------------ */

export function ProofStrip({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10">
        <p className="max-w-xs text-sm leading-relaxed text-muted">{label}</p>
        <ul className="flex flex-wrap gap-2">
          {items.map((t) => (
            <li key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm text-paper/80">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Marquee({ items }: { items: string[] }) {
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-white/[0.07] py-3.5">
      <div className="marquee gap-0">
        {loop.map((t, i) => (
          <span key={i} className="flex items-center whitespace-nowrap px-5 text-sm text-muted">
            {t}
            <span className="ml-5 h-1 w-1 rounded-full bg-lamp/60" aria-hidden="true" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Features — hemispheres. Each one lights from wherever the pointer is. */
/* ------------------------------------------------------------------ */

function Hemi({ item }: { item: FeatureItem }) {
  const ref = useRef<HTMLLIElement>(null);

  function track(e: React.PointerEvent<HTMLLIElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  return (
    <li ref={ref} onPointerMove={track} className="hemi h-full rounded-2xl p-6">
      <span className="relative mb-4 inline-grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lamp">
        <Icon name={item.icon as IconName} size={18} />
      </span>
      <h3 className="relative font-display text-[1.05rem] font-semibold text-paper">{item.title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
    </li>
  );
}

export function Features({ intro, items }: { intro: SectionIntro; items: FeatureItem[] }) {
  return (
    <section id="features" className="scroll-mt-28 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHead intro={intro} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((f) => <Hemi key={f.title} item={f} />)}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works — genuinely a sequence, so it is numbered.              */
/* ------------------------------------------------------------------ */

export function HowItWorks({ intro, items }: { intro: SectionIntro; items: StepItem[] }) {
  return (
    <section id="how" className="scroll-mt-28 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHead intro={intro} />
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          {items.map((s, i) => (
            <li key={s.title} className="relative md:pr-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/12 text-sm font-semibold text-lampsoft">
                    {i + 1}
                  </span>
                  {i < items.length - 1 && (
                    <span className="hidden h-px flex-1 bg-gradient-to-r from-white/15 to-transparent md:block" aria-hidden="true" />
                  )}
                </div>
                <h3 className="font-display text-[1.1rem] font-semibold text-paper">{s.title}</h3>
              <p className="lede mt-2 text-sm">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The closing band — the seam again, full width.                       */
/* ------------------------------------------------------------------ */

export function CtaBand({ title, sub, button }: { title: string; sub: string; button: string }) {
  return (
    <section className="relative overflow-hidden px-4 py-28 sm:px-6">
      <div className="aurora !inset-x-0 !top-auto !bottom-[-30%] !h-[55vh] opacity-70" />
      <div className="relative mx-auto max-w-2xl text-center">
        <div className="seam mx-auto mb-10 hidden h-20 w-px sm:block" aria-hidden="true">
          <span className="seam-spark" />
        </div>
        <h2 className="text-balance text-3xl sm:text-[2.7rem]">{title}</h2>
        <p className="lede mx-auto mt-4">{sub}</p>
        <div className="mt-9 flex justify-center">
          <Link href="/login?mode=signup&next=/dashboard" className="btn btn-primary !px-8 !py-4 text-base">
            {button}
          </Link>
        </div>
      </div>
    </section>
  );
}
