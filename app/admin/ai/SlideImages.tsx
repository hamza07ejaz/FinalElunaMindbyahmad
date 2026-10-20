"use client";
import { useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Field, Pill, useToast } from "../ui";

type State = {
  hasStockKey: boolean; stockPreview: string; stockProvider: string;
  aiImagesEnabled: boolean; maxImagesPerDeck: number;
  status: string; lastError: string | null;
};

/**
 * Pictures on presentation slides.
 *
 * Sits beside the AI keys because it is the same kind of thing — a credential
 * and a switch — and because the two decisions are related: generated pictures
 * are billed to whichever AI key is at the top of that list.
 */
export function SlideImages() {
  const [s, setS] = useState<State | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const { toast, toastNode } = useToast();

  const load = () =>
    fetch("/api/admin/images", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setS(j); })
      .catch(() => {});

  useEffect(() => { void load(); }, []);

  async function call(method: string, payload?: Record<string, unknown>, label = "save") {
    setBusy(label);
    try {
      const r = await fetch("/api/admin/images", {
        method, headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not save.", true); return null; }
      setS(j);
      return j;
    } catch { toast("Network problem.", true); return null; }
    finally { setBusy(""); }
  }

  if (!s) return null;

  return (
    <Card className="mt-6">
      {toastNode}
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-paper">Pictures on slides</h3>
        {s.hasStockKey && (
          <Pill tone={s.status === "ok" ? "live" : s.status === "failed" ? "blocked" : "draft"}>
            {s.status === "ok" ? "Working" : s.status === "failed" ? "Failing" : "Untested"}
          </Pill>
        )}
      </div>
      <p className="mb-4 text-sm text-muted">
        Without a key the presentation tool still works — every slide that wanted a picture becomes a normal one.
      </p>

      <Field label="Pexels API key"
        hint={s.hasStockKey ? `Saved: ${s.stockPreview}. Leave blank to keep it.` : "Free at pexels.com/api. Its licence allows commercial use, which matters for decks students hand in."}>
        <input className="input" value={key} type="password" autoComplete="off" spellCheck={false}
          placeholder={s.hasStockKey ? "••••••••" : "paste the key"}
          onChange={(e) => setKey(e.target.value)} />
      </Field>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !key.trim()}
          onClick={async () => { const j = await call("PUT", { stockKey: key.trim() }); if (j) { setKey(""); toast("Key saved."); } }}>
          {busy === "save" ? <span className="spinner" /> : <Icon name="save" size={14} />} Save key
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !s.hasStockKey}
          onClick={async () => { const j = await call("PATCH", undefined, "test"); if (j) toast(j.detail, !j.ok); }}>
          {busy === "test" ? <span className="spinner" /> : <Icon name="zap" size={14} />} Test it
        </button>
        {s.hasStockKey && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy}
            onClick={async () => { const j = await call("PUT", { clearStockKey: true }, "clear"); if (j) toast("Key removed."); }}>
            <Icon name="trash" size={14} /> Remove
          </button>
        )}
      </div>

      {s.status === "failed" && s.lastError && (
        <p role="alert" className="mt-3 text-xs text-red-300">{s.lastError}</p>
      )}

      <div className="mt-5 grid gap-4 border-t border-white/5 pt-5 sm:grid-cols-2">
        <Field label="Pictures per deck" hint="0 to 12. Each one is a request, and with AI pictures each one is also a charge.">
          <input type="number" min={0} max={12} className="input !w-28" value={s.maxImagesPerDeck}
            onChange={(e) => setS({ ...s, maxImagesPerDeck: Math.min(12, Math.max(0, Number(e.target.value) || 0)) })}
            onBlur={() => call("PUT", { maxImagesPerDeck: s.maxImagesPerDeck }, "cap")} />
        </Field>

        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-paper">Let students generate pictures with AI</p>
              <p className="mt-0.5 text-xs text-muted">
                Costs money per picture, billed to your top AI key, and takes seconds rather than an instant.
                Off means stock photos only.
              </p>
            </div>
            <button type="button" role="switch" aria-checked={s.aiImagesEnabled} aria-label="Let students generate pictures with AI"
              disabled={!!busy}
              onClick={() => call("PUT", { aiImagesEnabled: !s.aiImagesEnabled }, "ai")}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${s.aiImagesEnabled ? "bg-lamp" : "bg-white/15"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${s.aiImagesEnabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {s.aiImagesEnabled && (
            <p className="mt-2 text-xs text-amber-200/80">
              Not every provider can do this. Gemini&apos;s OpenAI-compatible endpoint cannot; an OpenAI key can.
              The tool falls back to stock photos when generation fails.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
