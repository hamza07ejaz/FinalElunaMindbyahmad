"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../_components/Icon";
import { Logo } from "../_components/Logo";
import { analytics } from "../../lib/analytics";

/**
 * Report the purchase, at most once ever.
 *
 * The decision is the server's: it marks the conversion reported as it hands
 * it over, so reloading this page or opening it again later gets nothing back
 * and no second event is pushed.
 */
async function reportPurchase() {
  try {
    const r = await fetch("/api/conversion", { method: "POST", cache: "no-store" });
    if (!r.ok) return;
    const { conversion } = await r.json();
    if (conversion?.transaction_id) {
      analytics.purchase(conversion.transaction_id, conversion.value, conversion.currency);
    }
  } catch {
    // A conversion that cannot be reported is a reporting problem, not the
    // customer's problem. They have their plan either way.
  }
}

export default function SuccessPage() {
  const [state, setState] = useState<"checking" | "done" | "slow">("checking");
  // Read from the admin settings rather than written into the sentence, which
  // is how this page ended up telling people to write to an address nobody
  // had used for months.
  const [supportEmail, setSupportEmail] = useState("hello@elunamind.com");

  useEffect(() => {
    fetch("/api/signup-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.supportEmail) setSupportEmail(j.supportEmail); })
      .catch(() => { /* the default stands */ });
  }, []);

  useEffect(() => {
    let tries = 0, stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const r = await fetch("/api/usage", { cache: "no-store" });
        if (r.status === 401) { window.location.href = "/login?next=/success"; return; }
        if (r.ok && (await r.json()).plan === "premium") {
          setState("done");
          // The plan is premium, so the webhook has landed and the payment is
          // real. Ask the server whether this particular purchase still needs
          // reporting; it answers once and never again.
          void reportPurchase();
          return;
        }
      } catch { /* retry */ }
      if (++tries >= 12) { setState("slow"); return; }
      setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, []);

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="lamp-glow -left-10 top-10 h-72 w-72 bg-violet-500/18" />
      <div className="lamp-glow bottom-0 right-0 h-72 w-72 bg-mint/15" style={{ animationDelay: "-6s" }} />
      <div className="glass-strong pop-in relative w-full max-w-md rounded-3xl p-9 text-center">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {state === "checking" && (<><div className="mx-auto mb-5 grid h-16 w-16 place-items-center"><span className="spinner !h-8 !w-8" /></div><h1 className="text-xl font-semibold text-paper">Confirming your payment…</h1><p className="mt-2 text-sm text-muted">This usually takes a few seconds.</p></>)}
        {state === "done" && (<><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-300"><Icon name="check" size={32} stroke={2.4} /></div><h1 className="text-2xl font-semibold text-paper">Welcome to Premium!</h1><p className="mt-2 text-sm text-muted">All study tools and higher limits are now unlocked.</p><Link href="/dashboard" className="btn btn-primary mt-7 w-full">Go to dashboard</Link></>)}
        {state === "slow" && (<><h1 className="text-xl font-semibold text-paper">Payment received, still activating</h1><p className="mt-2 text-sm text-muted">Your plan can take a minute to update. Open the dashboard and refresh in a moment. If it does not change, email {supportEmail}.</p><Link href="/dashboard" className="btn btn-primary mt-7 w-full">Go to dashboard</Link></>)}
      </div>
    </div>
  );
}
