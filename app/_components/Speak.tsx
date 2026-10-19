"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

/**
 * Read-aloud using the browser's own speech engine.
 *
 * Deliberately not an API call: a TTS endpoint would cost money per answer,
 * would not exist on the free Gemini-compatible provider, and would make the
 * student wait for a file. The browser speaks instantly, for free, in the
 * student's own system voices, and the button simply hides itself where the
 * engine is missing.
 */

/** Spoken text should not contain markdown punctuation or raw LaTeX. */
export function speakable(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " Code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, " a formula. ")
    .replace(/\$([^$\n]+)\$/g, " $1 ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, (row) => row.replace(/\|/g, ", "))
    .replace(/^[\s,:-]*$/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\\\(|\\\)|\\\[|\\\]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Picks a natural-sounding voice for the text's language, if the device has one. */
function pickVoice(voices: SpeechSynthesisVoice[], langHint: string) {
  if (!voices.length) return null;
  const want = langHint.toLowerCase();
  const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(want.slice(0, 2)));
  const pool = sameLang.length ? sameLang : voices;
  const nice = pool.find((v) => /natural|neural|enhanced|premium|google|samantha|aria/i.test(v.name));
  return nice ?? pool.find((v) => v.default) ?? pool[0];
}

/**
 * Send the engine the right language. Only the scripts that would be read badly
 * by an English voice are detected; everything in Latin script falls through to
 * the student's own default voice, which handles European languages fine.
 */
function guessLang(text: string) {
  if (/[֐-׿]/.test(text)) return "he-IL";
  if (/[؀-ۿ]/.test(text)) return "ar-SA";
  if (/[ऀ-ॿ]/.test(text)) return "hi-IN";
  if (/[぀-ヿ]/.test(text)) return "ja-JP";
  if (/[가-힯]/.test(text)) return "ko-KR";
  if (/[一-鿿]/.test(text)) return "zh-CN";
  return "en-US";
}

/** A browser capability, read without a hydration mismatch and without an extra render. */
const noSubscribe = () => () => {};
const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function Speak({ text, label, className = "btn btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "speaking" | "paused">("idle");
  // false on the server: there is no speech engine there, so the first paint
  // matches what the browser renders before the capability is known.
  const supported = useSyncExternalStore(noSubscribe, hasSpeech, () => false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!hasSpeech()) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    // Chrome fills the voice list asynchronously.
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setState("idle");
  }, []);

  const start = useCallback(() => {
    const body = speakable(text);
    if (!body) return;
    window.speechSynthesis.cancel();

    // Long answers are split into sentences: some engines silently truncate a
    // single very long utterance, and short ones also let the user stop sooner.
    const parts = body.match(/[^.!?\n]{1,220}(?:[.!?\n]+|$)/g) ?? [body];
    const lang = guessLang(body);
    const voice = pickVoice(voicesRef.current, lang);

    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.lang = voice?.lang ?? lang;
      if (voice) u.voice = voice;
      u.rate = 1;
      u.pitch = 1;
      if (i === parts.length - 1) {
        u.onend = () => setState("idle");
        u.onerror = () => setState("idle");
      }
      window.speechSynthesis.speak(u);
    });
    setState("speaking");
  }, [text]);

  if (!supported || !text.trim()) return null;

  if (state === "idle")
    return (
      <button type="button" className={className} onClick={start} title="Read this aloud">
        <Icon name="volume" size={14} /> {label ?? "Listen"}
      </button>
    );

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button" className={className}
        onClick={() => {
          if (state === "speaking") { window.speechSynthesis.pause(); setState("paused"); }
          else { window.speechSynthesis.resume(); setState("speaking"); }
        }}
        title={state === "speaking" ? "Pause" : "Resume"}
      >
        <Icon name={state === "speaking" ? "pause" : "play"} size={14} />
        {state === "speaking" ? "Pause" : "Resume"}
      </button>
      <button type="button" className={className} onClick={stop} title="Stop reading">
        <Icon name="stop" size={14} /> Stop
      </button>
    </span>
  );
}
