"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Logo } from "../../_components/Logo";

type Step = "form" | "processing" | "done";

export default function DemoCheckout() {
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState("");
  const [card, setCard] = useState("4242 4242 4242 4242");
  const [exp, setExp] = useState("12 / 30");
  const [cvc, setCvc] = useState("123");
  const [name, setName] = useState("");

  // after a successful demo upgrade, move on by itself
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => window.location.assign("/success"), 1400);
    return () => clearTimeout(t);
  }, [step]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setStep("processing");
    try {
      const r = await fetch("/api/checkout/demo", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { window.location.href = "/login?next=/checkout/demo"; return; }
      if (!r.ok) { setError(j.error || "Could not complete the demo upgrade."); setStep("form"); return; }
      setStep("done");
    } catch { setError("Network problem. Please try again."); setStep("form"); }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div className="lamp-glow -left-20 top-0 h-72 w-72 bg-violet-500/15" />
      <div className="lamp-glow -right-20 bottom-0 h-72 w-72 bg-indigo-500/15" />

      <div className="page-enter relative w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <Link href="/pricing" className="text-sm text-muted transition-colors hover:text-paper">← Back to plans</Link>
        </div>

        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-3 text-sm text-paper">
          <Icon name="spark" size={16} className="shrink-0 text-lamp" />
          <span><span className="text-lamp">Demo mode.</span> No card is charged and nothing is sent to a payment provider. The details below are fake.</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="glass-strong rounded-2xl p-6 sm:p-8">
            {step === "done" ? (
              <div className="py-10 text-center">
                <div className="pop-in mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-mint/15 text-mint"><Icon name="check" size={32} stroke={2.3} /></div>
                <h1 className="font-display text-2xl text-paper">You are on Premium</h1>
                <p className="mt-2 text-sm text-muted">Taking you to your account…</p>
              </div>
            ) : (
              <>
                <h1 className="font-display text-2xl text-paper">Payment details</h1>
                <p className="mt-1 text-sm text-muted">This form is a stand-in for the real checkout.</p>
                <form onSubmit={pay} className="mt-6 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-paper/90">Name on card</span>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmad Khan" disabled={step === "processing"} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-paper/90">Card number</span>
                    <div className="relative">
                      <input className="input !pl-11 font-mono" value={card} onChange={(e) => setCard(e.target.value)} disabled={step === "processing"} inputMode="numeric" />
                      <Icon name="career" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    </div>
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <span className="mb-1.5 block text-sm text-paper/90">Expiry</span>
                      <input className="input font-mono" value={exp} onChange={(e) => setExp(e.target.value)} disabled={step === "processing"} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm text-paper/90">CVC</span>
                      <input className="input font-mono" value={cvc} onChange={(e) => setCvc(e.target.value)} disabled={step === "processing"} />
                    </label>
                  </div>

                  {error && <p role="alert" className="pop-in rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}

                  <button type="submit" className="btn btn-primary w-full !py-3.5" disabled={step === "processing"}>
                    {step === "processing" ? <><span className="spinner" /> Processing…</> : <><Icon name="lock" size={15} /> Complete demo upgrade</>}
                  </button>
                  <p className="text-center text-xs text-muted">No real payment is taken.</p>
                </form>
              </>
            )}
          </div>

          <aside className="glass h-fit rounded-2xl p-6">
            <h2 className="font-display text-base text-paper">Order summary</h2>
            <div className="mt-4 flex items-baseline justify-between border-b border-white/10 pb-4">
              <span className="text-sm text-paper/85">Premium, monthly</span>
              <span className="font-display text-lg text-paper">$15.99</span>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm text-paper/80">
              {["All twelve study tools", "Much higher daily limits", "Flashcards, tests and mind maps", "Slide builder with PowerPoint export", "Cancel any time"].map((t) => (
                <li key={t} className="flex items-start gap-2.5"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-lamp" />{t}</li>
              ))}
            </ul>
            <div className="mt-5 flex items-baseline justify-between border-t border-white/10 pt-4">
              <span className="text-sm text-muted">Due today</span>
              <span className="font-display text-xl text-lamp">$0.00</span>
            </div>
            <p className="mt-1 text-xs text-muted">Demo mode, so nothing is charged.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
