"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase/browser";
import { Icon } from "../_components/Icon";
import { Logo } from "../_components/Logo";

export default function ResetPage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // The email link signs the user in first; without that session we cannot set a password.
  useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => setReady(!!data.user))
      .catch(() => setReady(false));
  }, []);

  const strength = pw.length >= 12 ? 3 : pw.length >= 8 ? 2 : pw.length >= 6 ? 1 : 0;
  const strengthLabel = ["Too short", "Weak", "Good", "Strong"][strength];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 6) { setError("Use at least 6 characters."); return; }
    if (pw !== pw2) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setError(error.message); return; }
      setDone(true);
      setTimeout(() => window.location.assign("/dashboard"), 1600);
    } catch { setError("Network problem. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="lamp-glow -left-20 top-10 h-72 w-72 bg-violet-500/15" />
      <div className="page-enter relative w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="glass-strong rounded-2xl p-8">
          {ready === null ? (
            <div className="py-6 text-center"><span className="spinner mx-auto" /></div>
          ) : done ? (
            <div className="text-center">
              <div className="pop-in mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-mint/15 text-mint"><Icon name="check" size={28} stroke={2.2} /></div>
              <h1 className="font-display text-xl text-paper">Password changed</h1>
              <p className="mt-2 text-sm text-muted">Taking you to your dashboard…</p>
            </div>
          ) : ready ? (
            <>
              <h1 className="font-display text-2xl text-paper">Set a new password</h1>
              <p className="mt-2 text-sm text-muted">Pick something you have not used elsewhere.</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-paper/90">New password</span>
                  <div className="relative">
                    <input className="input !pr-11" type={show ? "text" : "password"} required minLength={6} autoFocus
                      value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-paper">
                      <Icon name="eye" size={16} />
                    </button>
                  </div>
                  {pw && (
                    <span className="mt-2 flex items-center gap-2">
                      <span className="flex flex-1 gap-1">
                        {[1, 2, 3].map((i) => (
                          <span key={i} className="h-1 flex-1 rounded-full transition-colors"
                            style={{ background: strength >= i ? (strength === 1 ? "#f87171" : strength === 2 ? "var(--lamp)" : "var(--mint)") : "rgba(255,255,255,.12)" }} />
                        ))}
                      </span>
                      <span className="text-xs text-muted">{strengthLabel}</span>
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-paper/90">Confirm password</span>
                  <input className="input" type={show ? "text" : "password"} required value={pw2}
                    onChange={(e) => setPw2(e.target.value)} placeholder="Type it again" />
                </label>
                {error && <p role="alert" className="pop-in rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}
                <button type="submit" className="btn btn-primary w-full !py-3.5" disabled={busy}>
                  {busy ? <><span className="spinner" /> Saving…</> : "Save new password"}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-red-500/15 text-red-300"><Icon name="lock" size={26} /></div>
              <h1 className="font-display text-xl text-paper">This link has expired</h1>
              <p className="mt-3 text-sm text-muted">Reset links work once and last about an hour. Request a fresh one.</p>
              <Link href="/forgot" className="btn btn-primary mt-7 w-full">Send a new link</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
