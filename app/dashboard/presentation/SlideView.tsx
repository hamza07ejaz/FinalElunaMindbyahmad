"use client";
import { resolveLayout, type DeckTheme, type Slide } from "../../../lib/export/pptx";

/**
 * The slide as the student sees it before downloading.
 *
 * This mirrors the PowerPoint exporter rather than sharing code with it, because
 * the two draw with completely different tools — one positions text in inches on
 * a fixed canvas, the other lets a browser lay it out. What they must share is
 * the decision about WHICH layout a slide gets, so `resolveLayout` is imported
 * rather than reimplemented. A preview that disagrees with the file it produces
 * is worse than no preview.
 *
 * Every size is in percentages or viewport-relative clamps so the same markup
 * works in the small panel and in fullscreen presentation mode.
 */

const hex = (c: string) => `#${c}`;

export function SlideView({
  slide, index, total, theme,
}: { slide: Slide; index: number; total: number; theme: DeckTheme }) {
  const layout = resolveLayout(slide, index, total);
  const points = slide.bullets.map((b) => String(b).trim()).filter(Boolean);
  const img = slide.image;

  const title = { color: hex(theme.title), fontFamily: "var(--font-display-face), Georgia, serif" };
  const body = { color: hex(theme.body) };
  const Rule = ({ w = "9%" }: { w?: string }) => (
    <span className="mb-[3%] block h-[3px] rounded-full" style={{ width: w, background: hex(theme.accent) }} />
  );
  const Credit = ({ className = "" }: { className?: string }) =>
    img?.credit ? (
      <span className={`absolute text-[0.55rem] opacity-50 ${className}`} style={body}>{img.credit}</span>
    ) : null;

  if (layout === "cover") {
    return (
      <div className="flex h-full flex-col justify-center p-[5%]">
        <h2 className="text-[clamp(1.4rem,4.5vw,3rem)] font-semibold leading-tight" style={title}>{slide.title}</h2>
        <span className="my-[3%] block h-[3px] w-[12%] rounded-full" style={{ background: hex(theme.accent) }} />
        <p className="text-[clamp(.7rem,1.7vw,1.1rem)]" style={body}>
          {points.slice(0, 3).join("   ·   ")}
        </p>
      </div>
    );
  }

  if (layout === "section") {
    return (
      <div className="flex h-full flex-col justify-center p-[5%]">
        <span className="text-[clamp(.6rem,1.4vw,.95rem)] font-semibold" style={{ color: hex(theme.accent) }}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2 className="mt-[1.5%] text-[clamp(1.2rem,3.8vw,2.6rem)] font-semibold leading-tight" style={title}>{slide.title}</h2>
        <span className="my-[3%] block h-[3px] w-[9%] rounded-full" style={{ background: hex(theme.accent) }} />
        {points[0] && <p className="max-w-[80%] text-[clamp(.65rem,1.5vw,1rem)]" style={body}>{points[0]}</p>}
      </div>
    );
  }

  if (layout === "feature" && img) {
    return (
      <div className="relative h-full w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
        {/*
          Always a dark scrim with light text on it, whatever the theme.
          A light theme put dark text over whatever photograph turned up, and a
          photograph is the one thing here nobody chose: the first dark image
          made the title unreadable. White on a dark wash is the only
          combination that survives an unknown picture.
        */}
        <div className="absolute inset-x-0 bottom-0 h-[62%]"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,.92) 0%, rgba(0,0,0,.72) 45%, transparent 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 p-[5%]">
          <h2 className="text-[clamp(1rem,3vw,2.1rem)] font-semibold leading-tight"
            style={{ color: "#FFFFFF", fontFamily: title.fontFamily }}>{slide.title}</h2>
          {points.length > 0 && (
            <ul className="mt-[2%] list-disc space-y-[0.6%] pl-[4%] text-[clamp(.6rem,1.5vw,1rem)]" style={{ color: "#E8EAF0" }}>
              {points.slice(0, 3).map((b, k) => <li key={k}>{b}</li>)}
            </ul>
          )}
        </div>
        {img.credit && (
          <span className="absolute bottom-[1.5%] left-[5%] text-[0.55rem] text-white/45">{img.credit}</span>
        )}
      </div>
    );
  }

  if (layout === "image" && img) {
    // The picture swaps sides with the slide number, so two figure slides in a
    // row do not look like the same slide twice.
    const right = index % 2 === 1;
    return (
      <div className={`relative flex h-full w-full overflow-hidden ${right ? "flex-row" : "flex-row-reverse"}`}>
        <div className="flex w-[52%] flex-col justify-center p-[4.5%]">
          <h2 className="text-[clamp(.85rem,2.4vw,1.7rem)] font-semibold leading-tight" style={title}>{slide.title}</h2>
          <Rule w="18%" />
          <ul className="list-disc space-y-[2%] pl-[6%] text-[clamp(.58rem,1.35vw,.95rem)]" style={body}>
            {points.slice(0, 5).map((b, k) => <li key={k}>{b}</li>)}
          </ul>
        </div>
        <div className="relative w-[48%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt={img.alt} className="h-full w-full object-cover" />
          <Credit className="bottom-[2%] left-[4%]" />
        </div>
      </div>
    );
  }

  if (layout === "quote") {
    return (
      <div className="relative flex h-full flex-col justify-center p-[5%] pl-[9%]">
        <span className="absolute left-[2%] top-[14%] font-serif text-[clamp(3rem,9vw,6rem)] leading-none"
          style={{ color: hex(theme.accent) }} aria-hidden="true">&ldquo;</span>
        <p className="text-[clamp(.85rem,2.4vw,1.75rem)] italic leading-snug" style={title}>{points[0]}</p>
        {points[1] && (
          <>
            <span className="mt-[3%] block h-[3px] w-[6%] rounded-full" style={{ background: hex(theme.accent) }} />
            <p className="mt-[2%] text-[clamp(.6rem,1.4vw,1rem)]" style={body}>{points[1]}</p>
          </>
        )}
      </div>
    );
  }

  if (layout === "stat") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-[5%] text-center">
        {slide.title && <p className="mb-[2%] text-[clamp(.55rem,1.3vw,.9rem)]" style={body}>{slide.title}</p>}
        <p className="text-[clamp(2.2rem,9vw,5.5rem)] font-semibold leading-none"
          style={{ color: hex(theme.accent), fontFamily: "var(--font-display-face), Georgia, serif" }}>
          {points[0]}
        </p>
        <p className="mt-[3%] max-w-[75%] text-[clamp(.65rem,1.7vw,1.15rem)]" style={title}>{points[1]}</p>
      </div>
    );
  }

  // bullets and closing
  const closing = layout === "closing";
  return (
    <div className="flex h-full flex-col justify-center p-[5%]">
      <h2 className={`font-semibold leading-tight ${closing ? "text-[clamp(1.1rem,3.2vw,2.3rem)]" : "text-[clamp(1rem,2.9vw,2rem)]"}`} style={title}>
        {slide.title}
      </h2>
      <Rule w={closing ? "12%" : "9%"} />
      <ul className={`list-disc space-y-[1.1%] pl-[4%] ${closing ? "text-[clamp(.7rem,1.9vw,1.3rem)]" : "text-[clamp(.68rem,1.8vw,1.2rem)]"}`} style={body}>
        {points.map((b, k) => <li key={k}>{b}</li>)}
      </ul>
    </div>
  );
}
