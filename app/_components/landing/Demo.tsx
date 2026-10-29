"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The band above the three steps.
 *
 * It shows a video when one has been set in the admin panel, and an animation
 * of the same three steps when one has not. The fallback is the point: a
 * placeholder reading "video coming soon" is worse than the section not
 * existing, and a site that has to wait on a film crew before its landing page
 * is finished will wait a long time.
 *
 * The animation shows what the product does rather than decorating the page —
 * a page arriving, becoming notes, becoming questions — which is the same
 * thing the video would show.
 */

type Props = {
  videoUrl: string;
  poster?: string;
  caption?: string;
};

/** YouTube and Vimeo links turned into their embed form. Anything else is a file. */
function embedUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
      if (url.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${url.pathname}?rel=0&modestbranding=1`;
    }
    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      if (id) return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
    }
    if (host === "vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

const STEPS = [
  { label: "Your material", hint: "a PDF, a photo, a recording" },
  { label: "Read and understood", hint: "every page, every formula" },
  { label: "Notes, questions, a plan", hint: "ready to revise from" },
];

export function Demo({ videoUrl, poster, caption }: Props) {
  const embed = embedUrl(videoUrl);
  const isFile = !embed && /^https?:\/\/.+\.(mp4|webm|mov)(\?|$)/i.test(videoUrl.trim());

  return (
    <section className="px-4 pb-4 pt-20 sm:px-6" aria-label="How it works, shown">
      <div className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          {embed ? (
            <div className="aspect-video w-full">
              <iframe
                src={embed}
                className="h-full w-full"
                title="How Eluna Mind works"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : isFile ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              className="aspect-video w-full object-cover"
              src={videoUrl.trim()}
              poster={poster || undefined}
              controls playsInline preload="metadata"
            />
          ) : (
            <StepsAnimation />
          )}
        </div>
        {caption && <p className="mt-3 text-center text-sm text-muted">{caption}</p>}
      </div>
    </section>
  );
}

/**
 * The fallback: the three steps, animated.
 *
 * Driven by a timer rather than CSS keyframes because the stages have to stay
 * in step with each other and with the labels. It pauses when the section is
 * off screen — an animation nobody is looking at is just a laptop fan — and
 * stops entirely for anyone who has asked for reduced motion, who gets the
 * finished state instead of nothing.
 */
function StepsAnimation() {
  const [active, setActive] = useState(0);
  const [still, setStill] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setStill(true); setActive(STEPS.length - 1); return; }

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { timer ??= setInterval(() => setActive((i) => (i + 1) % STEPS.length), 2600); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.25 });
    if (box.current) io.observe(box.current);
    return () => { stop(); io.disconnect(); };
  }, []);

  return (
    // Shorter than the 16:9 a video gets. The same box with three small tiles
    // floating in the middle of it read as a half-loaded page.
    <div ref={box} className="relative aspect-[16/8] w-full overflow-hidden bg-[#070a17] sm:aspect-[16/7]">
      {/* a soft moving light, so the panel is not a flat rectangle */}
      <div className="lamp-glow absolute -left-20 top-0 h-72 w-72 bg-violet-500/20" />
      <div className="lamp-glow absolute -right-16 bottom-0 h-64 w-64 bg-emerald-400/15" style={{ animationDelay: "-5s" }} />

      <div className="relative grid h-full grid-cols-3 items-center gap-3 px-[6%]">
        {STEPS.map((s, i) => {
          const on = i === active;
          const done = i < active || still;
          return (
            <div key={s.label} className="flex flex-col items-center text-center">
              <div
                className="relative mb-4 grid place-items-center rounded-2xl border transition-all duration-700"
                style={{
                  width: "clamp(3.4rem,10vw,6rem)",
                  height: "clamp(4.2rem,12.5vw,7.2rem)",
                  borderColor: on ? "rgba(167,139,250,.75)" : done ? "rgba(52,211,153,.5)" : "rgba(255,255,255,.12)",
                  background: on ? "rgba(139,92,246,.14)" : done ? "rgba(16,185,129,.08)" : "rgba(255,255,255,.03)",
                  transform: on ? "translateY(-6px) scale(1.04)" : "none",
                  boxShadow: on ? "0 18px 50px -18px rgba(139,92,246,.75)" : "none",
                }}
              >
                <Glyph index={i} lit={on || done} />
              </div>
              <p className="text-[clamp(.72rem,1.6vw,1.05rem)] font-medium transition-colors duration-500"
                style={{ color: on || done ? "#EDEFF7" : "rgba(237,239,247,.45)" }}>
                {s.label}
              </p>
              <p className="mt-1 text-[clamp(.55rem,1.1vw,.75rem)] transition-opacity duration-500"
                style={{ color: "rgba(237,239,247,.5)", opacity: on ? 1 : 0.45 }}>
                {s.hint}
              </p>
            </div>
          );
        })}

        {/* the line the progress travels along, behind the three tiles */}
        <div className="pointer-events-none absolute inset-x-[16%] top-[38%] -z-0 h-px bg-white/10">
          <div className="h-full bg-gradient-to-r from-violet-400 to-emerald-400 transition-all duration-700"
            style={{ width: still ? "100%" : `${(active / (STEPS.length - 1)) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/** A page, a page with lines on it, a page with a tick. Three stages, drawn. */
function Glyph({ index, lit }: { index: number; lit: boolean }) {
  const stroke = lit ? "#EDEFF7" : "rgba(237,239,247,.4)";
  const accent = lit ? "#A78BFA" : "rgba(237,239,247,.25)";
  return (
    <svg viewBox="0 0 32 40" className="h-[64%] w-auto" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="26" height="36" rx="3" stroke={stroke} strokeWidth="1.6" />
      {index === 0 && (
        <>
          <path d="M10 14h12M10 20h12M10 26h7" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" opacity=".6" />
          <path d="M16 31v5M13 34l3 3 3-3" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {index === 1 && (
        <>
          <path d="M9 13h14M9 19h14M9 25h9" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="24" cy="25" r="3" stroke={accent} strokeWidth="1.4" />
        </>
      )}
      {index === 2 && (
        <>
          <path d="M9 14h9M9 20h13M9 26h6" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
          <path d="M19 27.5l3 3 6-6.5" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
