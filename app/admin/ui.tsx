"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../_components/Icon";

export function Page({ title, sub, actions, children }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page-enter mx-auto w-full max-w-6xl px-4 py-7 sm:px-6">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-paper">{title}</h1>
          {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-5 ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-paper">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3 text-sm text-paper/90">
        {label}{hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted">{children}</p>;
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-2.5">{Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>;
}

/** Small toast used after every save, so an admin always sees the result. */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div role="status" className={`pop-in fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl ${
      msg.bad ? "border-red-400/40 bg-red-500/15 text-red-100" : "border-mint/40 bg-mint/15 text-mint"}`}>
      <Icon name={msg.bad ? "x" : "check"} size={15} /> {msg.text}
    </div>
  ) : null;
  return { toast: (text: string, bad = false) => setMsg({ text, bad }), toastNode: node };
}

/** Confirm before anything destructive or account-changing. */
export function Confirm({ open, title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel }:
  { open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div role="dialog" aria-modal="true" className="pop-in glass-strong relative w-full max-w-sm rounded-2xl p-6">
        <h2 className="font-display text-lg text-paper">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm}
            className={`btn btn-sm ${danger ? "!bg-red-500/90 !border-red-400 !text-white" : "btn-primary"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Pill({ tone, children }: { tone: "free" | "premium" | "trial" | "blocked" | "admin" | "staff" | "draft" | "live"; children: ReactNode }) {
  const map = {
    free: "chip",
    premium: "chip chip-brand",
    trial: "chip chip-ok",
    blocked: "chip !border-red-400/40 !bg-red-500/15 !text-red-200",
    admin: "chip !border-sky-400/40 !bg-sky-500/15 !text-sky-200",
    staff: "chip !border-violet-400/40 !bg-violet-500/15 !text-violet-200",
    draft: "chip",
    live: "chip chip-ok",
  } as const;
  return <span className={map[tone]}>{children}</span>;
}
