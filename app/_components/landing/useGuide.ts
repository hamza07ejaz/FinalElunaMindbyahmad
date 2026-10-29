"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The bot's walk down the page.
 *
 * Two behaviours, kept here so the chat component stays about chatting.
 *
 * It travels. The launcher used to sit in the bottom corner, where a visitor
 * who never scrolls never sees it. It now starts level with the header, where
 * it is the first thing offering help, and slides to its usual corner as the
 * page moves — so it is visible immediately and out of the way afterwards.
 *
 * And it narrates. As each section arrives it says one line about that part of
 * the page, once. The restraint is the design: a line per section, shown for a
 * few seconds, never repeated, and gone for the rest of the visit the moment
 * anyone dismisses it. An assistant that keeps interrupting is a popup.
 *
 * Neither happens for a visitor who has asked for reduced motion, and neither
 * happens once the chat panel is open, because then they are talking to it.
 */

export type GuideStop = { id: string; text: string };

/** Remembered for the tab, not the browser: a new visit may want the tour. */
const DISMISSED = "em-guide-off";

export function useGuide(stops: GuideStop[], paused: boolean) {
  /** 0 at the top of the page, 1 once the launcher has reached its corner. */
  const [progress, setProgress] = useState(0);
  const [said, setSaid] = useState<string | null>(null);
  const [off, setOff] = useState(false);

  const seen = useRef<Set<string>>(new Set());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    try { if (sessionStorage.getItem(DISMISSED) === "1") setOff(true); } catch { /* private window */ }
  }, []);

  /* ---------------- travel ---------------- */

  useEffect(() => {
    if (reduced.current) { setProgress(1); return; }

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Reaches the corner after about one screen of scrolling, which is
        // roughly when the hero has gone and the launcher stops being an
        // introduction and starts being a button.
        const span = Math.max(1, window.innerHeight * 0.9);
        setProgress(Math.min(1, window.scrollY / span));
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /* ---------------- narration ---------------- */

  useEffect(() => {
    if (off || paused || reduced.current || stops.length === 0) {
      setSaid(null);
      return;
    }

    const show = (text: string) => {
      setSaid(text);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // Long enough to read a short line twice, short enough not to follow
      // the reader down the page.
      hideTimer.current = setTimeout(() => setSaid(null), 5200);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.id;
          if (seen.current.has(id)) continue;     // each section speaks once
          const stop = stops.find((s) => s.id === id);
          if (!stop) continue;
          seen.current.add(id);
          show(stop.text);
          break;                                   // one at a time, in order
        }
      },
      // A section counts as arrived when it is properly on screen, not when
      // its first pixel appears — otherwise everything fires during a fast
      // scroll and the reader sees only the last line.
      { threshold: 0.35, rootMargin: "-10% 0px -25% 0px" },
    );

    const seenEls: Element[] = [];
    for (const s of stops) {
      const el = document.getElementById(s.id);
      if (el) { io.observe(el); seenEls.push(el); }
    }

    return () => {
      io.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      void seenEls;
    };
  }, [stops, off, paused]);

  const dismiss = () => {
    setSaid(null);
    setOff(true);
    try { sessionStorage.setItem(DISMISSED, "1"); } catch { /* fine */ }
  };

  return { progress, said, dismiss, reduced: reduced.current };
}
