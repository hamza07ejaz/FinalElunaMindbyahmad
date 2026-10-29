"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { useGuide, type GuideStop } from "./useGuide";

/**
 * The bot in the corner.
 *
 * "Alive" here means it reacts to the person rather than animating at them:
 * its eyes track the pointer across the whole page, it blinks on its own
 * rhythm, it looks down while it is thinking, and it closes its eyes happily
 * when it has just answered. The only autonomous motion is the blink and a
 * slow breath, both of which stop under reduced-motion.
 *
 * Answers come from /api/bot: the admin's written answers first, the AI only
 * for what they do not cover.
 */

/** Where the launcher rests at either end of its travel. */
const TOP_PX = 86;      // clear of the sticky header
const BOTTOM_PX = 86;   // the corner it has always lived in

type Msg = { id: number; role: "bot" | "user"; text: string };
type Mood = "idle" | "listening" | "thinking" | "pleased";

let nextId = 1;

/* ------------------------------------------------------------------ */
/* The face                                                            */
/* ------------------------------------------------------------------ */

function Face({ mood, gaze, size = 44 }: { mood: Mood; gaze: { x: number; y: number }; size?: number }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // Irregular, like a real blink. A metronome reads as a loading spinner.
      timer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        schedule();
      }, 2600 + Math.random() * 3800);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // Thinking looks down and away; pleased closes the eyes.
  const shut = blink || mood === "pleased";
  const dx = mood === "thinking" ? -1.4 : gaze.x * 2.6;
  const dy = mood === "thinking" ? 2 : gaze.y * 2;

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="relative z-10">
      <defs>
        <radialGradient id="bot-core" cx="0.42" cy="0.36" r="0.72">
          <stop offset="0" stopColor="#1a2340" />
          <stop offset="1" stopColor="#070a17" />
        </radialGradient>
      </defs>

      <circle cx="24" cy="24" r="19" fill="url(#bot-core)" />
      {/* the seam, as on the mark */}
      <line x1="24" y1="7" x2="24" y2="41" stroke="var(--s3)" strokeWidth="1" strokeOpacity="0.32" />

      <g style={{ transform: `translate(${dx}px, ${dy}px)`, transition: "transform .22s cubic-bezier(.2,.7,.2,1)" }}>
        {shut ? (
          <>
            <path d="M13.5 23.5q4 3.4 8 0" stroke="var(--s1)" strokeWidth="2.1" strokeLinecap="round" fill="none" />
            <path d="M26.5 23.5q4 3.4 8 0" stroke="var(--s5)" strokeWidth="2.1" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <ellipse cx="17.5" cy="23" rx="2.5" ry="3.1" fill="var(--s1)" />
            <ellipse cx="30.5" cy="23" rx="2.5" ry="3.1" fill="var(--s5)" />
            <circle cx="16.7" cy="21.9" r="0.8" fill="#fff" fillOpacity="0.85" />
            <circle cx="29.7" cy="21.9" r="0.8" fill="#fff" fillOpacity="0.85" />
          </>
        )}
      </g>

      {mood === "thinking" && (
        <g fill="var(--s3)">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={19 + i * 5} cy="33" r="1.5">
              <animate attributeName="opacity" values="0.25;1;0.25" dur="1.1s" begin={`${i * 0.16}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */

export function SiteBot({ name, greeting, siteName, stops = [] }:
  { name: string; greeting: string; siteName: string; stops?: GuideStop[] }) {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Where the launcher sits, and what it is saying about the section on
  // screen. Paused while the panel is open: it is a conversation then.
  const { progress, said, dismiss } = useGuide(stops, open);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* --- the eyes follow the pointer anywhere on the page --- */
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let frame = 0;
    let latest = { x: 0, y: 0 };
    const apply = () => {
      frame = 0;
      setGaze(latest);
    };
    const onMove = (e: PointerEvent) => {
      const el = launcherRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Normalised and clamped, so a pointer at the far edge of a wide screen
      // does not peg the eyes permanently to one side.
      latest = {
        x: Math.max(-1, Math.min(1, (e.clientX - cx) / 420)),
        y: Math.max(-1, Math.min(1, (e.clientY - cy) / 320)),
      };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(frame); };
  }, []);

  /* --- greeting and starter chips, fetched once on first open --- */
  useEffect(() => {
    if (!open || msgs.length) return;
    setMsgs([{ id: nextId++, role: "bot", text: greeting }]);
    let alive = true;
    fetch("/api/bot", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.suggestions?.length) setSuggestions(j.suggestions); })
      .catch(() => { /* chips are optional */ });
    return () => { alive = false; };
  }, [open, greeting, msgs.length]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setSuggestions([]);
    setMsgs((m) => [...m, { id: nextId++, role: "user", text: q }]);
    setBusy(true);
    setMood("thinking");

    try {
      const r = await fetch("/api/bot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const j = await r.json().catch(() => ({}));
      const reply = j.reply || `I could not reach my own brain just then. Try again, or email the team.`;
      setMsgs((m) => [...m, { id: nextId++, role: "bot", text: reply }]);
      setMood("pleased");
      setTimeout(() => setMood("idle"), 1100);
    } catch {
      setMsgs((m) => [...m, {
        id: nextId++, role: "bot",
        text: "My connection dropped. Check you are online and ask me again.",
      }]);
      setMood("idle");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <>
      {/* ---------------- launcher ---------------- */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerEnter={() => mood === "idle" && setMood("listening")}
        onPointerLeave={() => mood === "listening" && setMood("idle")}
        aria-label={open ? `Close ${name}` : `Ask ${name} about ${siteName}`}
        aria-expanded={open}
        className="group fixed right-5 z-40 grid h-[58px] w-[58px] place-items-center rounded-full sm:right-7"
        style={{
          /*
           * Level with the header at the top of the page, in the usual corner
           * once the reader has moved. Driven by `top` rather than a transform
           * so the speech bubble beside it can be positioned against the same
           * number without the two drifting apart.
           */
          top: `calc(${TOP_PX}px + (100vh - ${TOP_PX + BOTTOM_PX}px) * ${progress})`,
          transition: "top 420ms cubic-bezier(.22,.61,.36,1)",
        }}
      >
        {/* the spectrum ring, slowly turning */}
        <span className="orb-ring absolute inset-0 rounded-full opacity-90" />
        {/*
          Lit, not black. The interior used to be #070a17 — the page background
          — so on a dark page the launcher read as a thin ring around a hole
          and people did not see there was anything there to press.
        */}
        <span className="absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_30%_25%,#7C5CFF_0%,#5B3FD6_45%,#2A1B66_100%)]" />
        <span className="absolute inset-0 rounded-full shadow-[0_8px_30px_-6px_rgba(124,92,255,.65)] transition-shadow duration-300 group-hover:shadow-[0_0_38px_-4px_rgba(139,108,255,.95)]" />
        {open
          ? <Icon name="x" size={20} className="relative z-10 text-paper" />
          : <Face mood={mood} gaze={gaze} />}
      </button>

      {/* ---------------- what it is saying about this section ---------------- */}
      {said && !open && (
        <div
          role="status"
          className="pop-in fixed right-[5.6rem] z-40 w-[min(17rem,calc(100vw-8rem))] rounded-2xl border border-violet-400/25 bg-[#120f26]/95 px-3.5 py-2.5 shadow-[0_18px_50px_-18px_rgba(124,92,255,.8)] backdrop-blur-xl sm:right-[6.4rem]"
          style={{
            /*
             * Centred on the launcher, and kept inside the window.
             *
             * Following the launcher's own `top` put the bubble's top edge
             * level with it, so once the launcher reached the corner the text
             * ran off the bottom of the screen — the last line of every
             * message was cut in half. It is now centred on the launcher and
             * its centre is clamped, which keeps both ends on screen whether
             * the launcher is up by the header or down in the corner.
             */
            top: `min(calc(${TOP_PX + 29}px + (100vh - ${TOP_PX + BOTTOM_PX}px) * ${progress}), calc(100vh - 92px))`,
            transform: "translateY(-50%)",
            transition: "top 420ms cubic-bezier(.22,.61,.36,1)",
          }}
        >
          <p className="pr-4 text-[0.8rem] leading-relaxed text-paper/90">{said}</p>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Stop the tour"
            className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted transition-colors hover:text-paper"
          >
            <Icon name="x" size={12} />
          </button>
          {/* the little tail pointing at the launcher */}
          <span className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-r border-violet-400/25 bg-[#120f26]" />
        </div>
      )}

      {/* ---------------- panel ---------------- */}
      {open && (
        <div
          role="dialog" aria-label={`${name} — questions about ${siteName}`}
          className="pop-in fixed bottom-[5.6rem] right-4 z-40 flex max-h-[min(30rem,70vh)] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0d1c]/96 shadow-2xl backdrop-blur-xl sm:bottom-[6.6rem] sm:right-7"
        >
          <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full">
              <span className="orb-ring absolute inset-0 rounded-full opacity-80" />
              <span className="absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_30%_25%,#7C5CFF_0%,#5B3FD6_45%,#2A1B66_100%)]" />
              <Face mood={mood} gaze={gaze} size={30} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-paper">{name}</p>
              <p className="text-[0.7rem] text-muted">
                {busy ? "Thinking…" : `Questions about ${siteName}`}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
              className="ml-auto rounded-lg p-1.5 text-muted transition hover:bg-white/10 hover:text-paper">
              <Icon name="x" size={16} />
            </button>
          </header>

          <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <p className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.86rem] leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-md bg-[#1b2440] text-paper"
                    : "rounded-bl-md border border-white/[0.08] bg-white/[0.04] text-paper/90"
                }`}>
                  {m.text}
                </p>
              </div>
            ))}
            {busy && (
              <div className="flex">
                <div className="dots rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {suggestions.length > 0 && !busy && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-left text-xs text-paper/80 transition hover:border-violet-400/50 hover:text-paper">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="border-t border-white/[0.07] p-3" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5 focus-within:border-violet-400/50">
              <input
                ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                maxLength={300} placeholder={`Ask about ${siteName}…`} disabled={busy}
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[0.88rem] text-paper outline-none placeholder:text-mute/70"
              />
              <button type="submit" disabled={!input.trim() || busy} aria-label="Send"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#07040f] transition disabled:opacity-35"
                style={{ background: "var(--sweep)" }}>
                <Icon name="send" size={15} />
              </button>
            </div>
            <p className="mt-2 px-1 text-[0.66rem] text-mute/70">
              I answer questions about the product. For help with your actual coursework, sign in.
            </p>
          </form>
        </div>
      )}
    </>
  );
}
