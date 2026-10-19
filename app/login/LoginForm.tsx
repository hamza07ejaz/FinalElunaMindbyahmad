"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase/browser";
import { Icon } from "../_components/Icon";
import { Logo } from "../_components/Logo";

/**
 * Whether to offer Google sign-in is an admin setting now, not a build-time
 * constant, so turning it on does not mean a redeploy. The env var is still
 * honoured server-side for deployments that already set it.
 *
 * It starts false and is switched on by the status fetch, which means the
 * button appears a moment after the page does rather than flashing and
 * vanishing on a site that does not use it.
 */

function safeNext(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

/**
 * Turn a transport failure into a sentence.
 *
 * When the browser cannot reach Supabase at all — DNS, a blocked request, an
 * offline laptop, a content security policy that does not list the project —
 * the client hands back the raw failure. "Failed to fetch" and
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` are the two that
 * surface, and both are meaningless to the person trying to log in: they read
 * like the site is broken in a way they caused.
 *
 * The real cause is always configuration or connectivity, never the password,
 * so say that and leave the detail in the console for whoever is on call.
 */
function friendly(message: string): string {
  const transport = /failed to fetch|networkerror|load failed|fetch failed|is not valid json|unexpected token/i;
  if (transport.test(message)) {
    console.error("auth transport failure:", message);
    return "Could not reach the server. Check your connection and try again — if it keeps happening, the site is misconfigured rather than your details being wrong.";
  }
  return message;
}

/** Small looping proof-of-life next to the form, so the page is not just a box on a wall. */
function SidePanel() {
  const LINES = [
    "Explain photosynthesis like I'm 12",
    "Quiz me on the French Revolution",
    "Mujhe derivatives asaan tareeqe se samjhao",
    "Make a 7-day plan for my chemistry exam",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 3200);
    return () => clearInterval(t);
  }, [LINES.length]);

  return (
    <div className="relative hidden overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
      <div className="lamp-glow -left-16 top-24 h-80 w-80 bg-violet-500/18" style={{ animation: "lamp-pulse 8s ease-in-out infinite" }} />
      <div className="lamp-glow -right-10 bottom-0 h-72 w-72 bg-indigo-500/18" />

      <div className="relative"><Logo /></div>

      <div className="relative max-w-md">
        <h2 className="text-4xl leading-tight">The tutor who is still awake at 1 a.m.</h2>

        <div className="mt-8 h-14">
          {LINES.map((l, k) => (
            <p key={l} aria-hidden={k !== i}
              className="absolute max-w-md rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-paper/85 transition-all duration-500"
              style={{ opacity: k === i ? 1 : 0, transform: k === i ? "none" : "translateY(10px)" }}>
              <span className="mr-2 text-lamp">›</span>{l}
            </p>
          ))}
        </div>

        <ul className="mt-10 space-y-3.5 text-sm text-paper/80">
          {["Step-by-step answers, not just the final one", "Reads your own PDFs, slides and recordings", "Free to start, no card needed"].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mint/15 text-mint"><Icon name="check" size={13} /></span>{t}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-muted">© {new Date().getFullYear()} Eluna Mind</p>
    </div>
  );
}

export function LoginForm() {
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const [mode, setMode] = useState<"signin" | "signup">(sp.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState(sp.get("error") ? "That sign-in did not complete. Please try again." : "");
  const [info, setInfo] = useState("");
  const [signupsOpen, setSignupsOpen] = useState(true);
  const [showGoogle, setShowGoogle] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/signup-status")
      .then((r) => r.json())
      .then((j) => {
        setSignupsOpen(j.signupsOpen !== false);
        setShowGoogle(j.googleAuth === true);
      })
      .catch(() => {});
  }, []);

  // already signed in -> go straight in
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) window.location.replace(next); }).catch(() => {});
  }, [next]);

  useEffect(() => { emailRef.current?.focus(); }, []);

  const strength = password.length >= 12 ? 3 : password.length >= 8 ? 2 : password.length >= 6 ? 1 : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo("");
    if (password.length < 6) { setError("Your password needs at least 6 characters."); return; }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setError(/invalid login/i.test(error.message) ? "That email and password do not match. Check both, or reset your password." : friendly(error.message));
          return;
        }
        window.location.assign(next);
      } else {
        if (!signupsOpen) { setError("New sign-ups are paused right now. Please check back soon."); return; }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) {
          setError(/already registered/i.test(error.message) ? "An account already uses this email. Try logging in instead." : friendly(error.message));
          return;
        }
        if (data.session) window.location.assign(next);
        else setInfo("Account created. Check your email and click the confirmation link to continue.");
      }
    } catch { setError("Network problem. Please check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function google() {
    setError(""); setGoogleBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setError(friendly(error.message)); setGoogleBusy(false); }
  }

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      <SidePanel />

      <div className="relative flex items-center justify-center px-4 py-10">
        <div className="lamp-glow -right-10 -top-10 h-56 w-56 bg-violet-500/15 lg:hidden" />

        <div className="page-enter relative w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>

          <h1 className="font-display text-3xl text-paper">{mode === "signin" ? "Welcome back" : "Create your free account"}</h1>
          <p className="mt-2 text-sm text-muted">
            {mode === "signin" ? "Log in to pick up where you left off." : "Start studying in under a minute. No card needed."}
          </p>

          {/* sliding tab switch */}
          <div className="relative mt-6 flex rounded-xl bg-white/5 p-1">
            <span className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-lg bg-lamp transition-transform duration-300 ease-out"
              style={{ transform: mode === "signup" ? "translateX(100%)" : "none" }} aria-hidden="true" />
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" disabled={m === "signup" && !signupsOpen}
                onClick={() => { setMode(m); setError(""); setInfo(""); }}
                className={`relative z-10 flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50 ${mode === m ? "text-[#07040f]" : "text-muted hover:text-paper"}`}>
                {m === "signin" ? "Log in" : signupsOpen ? "Sign up" : "Sign up paused"}
              </button>
            ))}
          </div>

          {showGoogle && (
            <>
              <button type="button" onClick={google} className="btn btn-ghost mt-5 w-full !py-3" disabled={googleBusy}>
                {googleBusy ? <span className="spinner" /> : (
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" /></svg>
                )}
                Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-white/10" />or with email<span className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={`space-y-4 ${showGoogle ? "" : "mt-6"}`}>
            <label className="block">
              <span className="mb-1.5 block text-sm text-paper/90">Email</span>
              <div className="relative">
                <Icon name="send" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input ref={emailRef} className="input !pl-10" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-baseline justify-between text-sm text-paper/90">
                Password
                {mode === "signin" && <Link href="/forgot" className="-my-1 inline-block py-1 text-xs text-lamp transition-opacity hover:opacity-80">Forgot it?</Link>}
              </span>
              <div className="relative">
                <Icon name="lock" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input !pl-10 !pr-11" type={show ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signin" ? "Your password" : "At least 6 characters"} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition-colors hover:text-paper">
                  <Icon name="eye" size={16} />
                </button>
              </div>
              {mode === "signup" && password.length > 0 && (
                <span className="mt-2 flex gap-1" aria-hidden="true">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className="h-1 flex-1 rounded-full transition-colors duration-300"
                      style={{ background: strength >= i ? (strength === 1 ? "#f87171" : strength === 2 ? "var(--lamp)" : "var(--mint)") : "rgba(255,255,255,.12)" }} />
                  ))}
                </span>
              )}
            </label>

            {error && <p role="alert" className="pop-in rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p>}
            {info && <p role="status" className="pop-in rounded-xl border border-mint/30 bg-mint/10 p-3 text-sm text-mint">{info}</p>}

            <button type="submit" className="btn btn-primary w-full !py-3.5" disabled={busy}>
              {busy ? <><span className="spinner" /> Please wait…</> : mode === "signin" ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signin" ? (
              <>New here? <button type="button" className="-my-1 inline-block py-1 text-lamp hover:underline" onClick={() => { setMode("signup"); setError(""); }}>Create an account</button></>
            ) : (
              <>Already have an account? <button type="button" className="text-lamp hover:underline" onClick={() => { setMode("signin"); setError(""); }}>Log in</button></>
            )}
          </p>
          <p className="mt-4 text-center text-sm text-muted">
            <Link href="/" className="-my-1.5 inline-block py-1.5 transition-colors hover:text-paper">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
