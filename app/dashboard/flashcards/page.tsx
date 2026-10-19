"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { ErrorBox, Field, GenerateButton, Panel, Skeleton, ToolFrame, useToolRunner } from "../../_components/ToolUI";

type Card = { question: string; answer: string };

export default function FlashcardsPage() {
  const tool = useToolRunner<{ flashcards: Card[] }>("/api/generate-flashcards");
  const [topic, setTopic] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);

  async function generate() {
    const j = await tool.run({ topic });
    if (j) { setCards(j.flashcards); setI(0); setFlipped(false); }
  }
  const go = useCallback((d: number) => { setFlipped(false); setI((x) => Math.min(Math.max(x + d, 0), Math.max(cards.length - 1, 0))); }, [cards.length]);

  useEffect(() => {
    if (!cards.length) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cards.length, go]);

  return (
    <ToolFrame toolKey="flashcards">
      <div className="space-y-5">
        <Panel>
          <Field label="Topic" hint={`${topic.length}/300`}><input className="input" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic.trim() && generate()} placeholder="e.g. Human heart anatomy" /></Field>
          <div className="mt-4"><GenerateButton loading={tool.loading} disabled={!topic.trim()} onClick={generate} label="Make flashcards" /></div>
        </Panel>
        <ErrorBox error={tool.error} upgrade={tool.upgrade} />
        {tool.loading && <Panel><Skeleton lines={5} /></Panel>}
        {!tool.loading && cards.length > 0 && (
          <div className="pop-in">
            <div className="mb-3 flex items-center justify-between text-sm text-muted"><span>Card {i + 1} of {cards.length}</span><span className="hidden sm:inline">← → to move · Space to flip</span></div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-s2 to-s5 transition-all duration-500" style={{ width: `${((i + 1) / cards.length) * 100}%` }} /></div>
            <div className="flip-scene">
              <div className={`flip-card h-72 cursor-pointer sm:h-80 ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((f) => !f)} role="button" tabIndex={0} aria-label="Flip card">
                <div className="flip-face glass-strong grid place-items-center rounded-3xl p-8 text-center">
                  <div><span className="chip chip-brand mb-4">Question</span><p className="text-xl font-semibold leading-snug text-paper sm:text-2xl">{cards[i].question}</p><p className="mt-5 text-xs text-muted">Tap to reveal the answer</p></div>
                </div>
                <div className="flip-face flip-back grid place-items-center rounded-3xl border border-emerald-400/30 p-8 text-center" style={{ background: "linear-gradient(135deg, rgba(16,185,129,.18), rgba(34,211,238,.12))" }}>
                  <div><span className="chip chip-ok mb-4">Answer</span><p className="text-lg leading-relaxed text-paper sm:text-xl">{cards[i].answer}</p></div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => go(-1)} disabled={i === 0}><span className="rotate-180"><Icon name="chevron" size={16} /></span> Previous</button>
              <button type="button" className="btn btn-primary" onClick={() => go(1)} disabled={i === cards.length - 1}>Next <Icon name="chevron" size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </ToolFrame>
  );
}
