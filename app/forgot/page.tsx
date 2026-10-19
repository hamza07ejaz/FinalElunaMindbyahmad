"use client";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabase/browser";
import { Icon } from "../_components/Icon";
import { Logo } from "../_components/Logo";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset`,
      });
      // Don't reveal whether an account exists: the message is the same either way.
      if (error && !/rate|limit/i.test(error.message)) console.error(error.message);
      if (error && /rate|limit/i.test(error.message)) { setError("Too many attempts. Please wait a few minutes and try again."); return; }
      setSent(true);
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="lamp-glow -left-20 top-10 h-72 w-72 bg-violet-500/15" />
      <div className="lamp-glow -right-20 bottom-10 h-72 w-72 bg-indigo-500/15" />

      <div className="page-enter relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>

        {sent ? (
          <div className="glass-strong rounded-2xl p-8 text-center">
            <div className="pop-in mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-mint/15 text-mint">
              <Icon name="check" size={28} stroke={2.2} />
            </div>
            <h1 className="font-display text-xl text-paper">Check your email</h1>
            <p className="mt-3 text-sm text-muted">
              If an account exists for <span className="text-paper">{email}</span>, we have sent a link to set a new password.
              It expires in about an hour.
            </p>
            <p className="mt-4 text-xs text-muted">Nothing arrived? Look in spam, then try again in a minute.</p>
            <Link href="/login" className="btn btn-ghost mt-7 w-full">Back to log in</Link>
          </div>
        ) : (
          <div className="glass-strong rounded-2xl p-8">
            <h1 className="font-display text-2xl text-paper">Forgot your password?</h1>
            <p className="mt-2 text-sm text-muted">Enter your email and we will send you a link to set a new one.</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm text-paper/90">Email</span>
                <input className="input" type="email" required autoFocus value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              {error && <p role="alert" className="pop-in rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}
              <button type="submit" className="btn btn-primary w-full !py-3.5" disabled={busy || !email.trim()}>
                {busy ? <><span className="spinner" /> Sending…</> : "Send reset link"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              <Link href="/login" className="-my-1.5 inline-block py-1.5 transition-colors hover:text-paper">← Back to log in</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
