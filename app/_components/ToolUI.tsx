"use client";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { TOOL_BY_KEY } from "./tools";
import { useUsage } from "./UsageProvider";
import { UpgradeButton } from "./Upgrade";
import type { Feature } from "../../lib/plans";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-2xl p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-paper/85">
        {label}{hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4" style={{ width: `${95 - ((i * 13) % 45)}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, upgrade }: { error: string | null; upgrade?: boolean }) {
  if (!error) return null;
  return (
    // role="alert" so the message is read out the moment it appears. Without it
    // a blind user presses Generate and gets silence.
    <div role="alert" className="pop-in rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
      <p>{error}</p>
      {upgrade && <div className="mt-3"><UpgradeButton label="Unlock more with Premium" className="btn btn-primary btn-sm" /></div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); } catch { /* clipboard blocked */ }
    }}>
      <Icon name={ok ? "check" : "copy"} size={14} /> {ok ? "Copied" : label}
    </button>
  );
}

export function LockedPanel({ title }: { title: string }) {
  return (
    <Panel className="relative overflow-hidden text-center">
      <div className="lamp-glow -left-10 -top-10 h-48 w-48 bg-violet-500/18" />
      <div className="lamp-glow -bottom-10 -right-10 h-48 w-48 bg-indigo-500/18" />
      <div className="relative mx-auto max-w-md py-8">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-lamp float-y"><Icon name="lock" size={26} /></div>
        <h2 className="text-xl font-semibold text-paper">{title} is a Premium tool</h2>
        <p className="mx-auto mt-2 text-sm text-muted">Upgrade to unlock every study tool, higher daily limits and priority access.</p>
        <div className="mt-6 flex justify-center"><UpgradeButton /></div>
      </div>
    </Panel>
  );
}

// Standard page frame for every tool: title, "left today" chip, and the Premium lock.
export function ToolFrame({ toolKey, children, wide = false }: { toolKey: Feature; children: ReactNode; wide?: boolean }) {
  const tool = TOOL_BY_KEY[toolKey];
  const { usage } = useUsage();
  const u = usage[toolKey];
  const left = Math.max(0, u.limit - u.used);
  return (
    <div className={`page-enter mx-auto w-full px-4 py-6 sm:px-6 lg:py-9 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-paper" style={{ background: `linear-gradient(135deg, ${tool.grad[0]}, ${tool.grad[1]})`, boxShadow: `0 12px 30px -12px ${tool.grad[0]}` }}>
          <Icon name={tool.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-paper">{tool.title}</h1>
          <p className="text-sm text-muted">{tool.desc}</p>
        </div>
        {u.locked
          ? <span className="chip chip-brand"><Icon name="lock" size={12} /> Premium</span>
          : <span className={`chip ${left === 0 ? "" : "chip-ok"}`} title="Resets daily">{left} of {u.limit} left today</span>}
      </header>
      {u.locked ? <LockedPanel title={tool.title} /> : children}
    </div>
  );
}

// Calls a tool API, handles login/limit errors, and refreshes the usage meter.
export function useToolRunner<T = unknown>(endpoint: string) {
  const { refresh } = useUsage();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  async function run(body: Record<string, unknown>): Promise<T | null> {
    setLoading(true); setError(null); setUpgrade(false);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) { window.location.href = `/login?next=${encodeURIComponent(pathname)}`; return null; }
      if (!res.ok) {
        setError(json.error || json.paraphrased || "Something went wrong. Please try again.");
        setUpgrade(!!json.upgrade);
        refresh();
        return null;
      }
      refresh();
      return json as T;
    } catch {
      setError("Network error. Please check your connection and try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }
  return { run, loading, error, upgrade, setError };
}

export function GenerateButton({ loading, disabled, onClick, label = "Generate", loadingLabel = "Generating…" }: { loading: boolean; disabled?: boolean; onClick: () => void; label?: string; loadingLabel?: string }) {
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={onClick} disabled={loading || disabled}
        aria-busy={loading || undefined}>
        {loading ? <><span className="spinner" /> {loadingLabel}</> : <><Icon name="spark" size={16} /> {label}</>}
      </button>
      {/* Spoken, not seen: the spinner means nothing to a screen reader. */}
      <span role="status" aria-live="polite" className="sr-only">
        {loading ? loadingLabel : ""}
      </span>
    </>
  );
}
