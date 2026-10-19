"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../_components/Icon";
import { Logo } from "../_components/Logo";

type Report = Record<string, unknown>;

const isBad = (v: unknown) =>
  typeof v === "string" && /MISSING|BROKEN|ERROR|NO ROW/i.test(v);

function Row({ k, v }: { k: string; v: unknown }) {
  const label = k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase();
  const text = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  const bad = isBad(v) || v === false;
  const good = v === "OK" || v === true;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-2.5 last:border-0">
      <span className="text-sm text-muted first-letter:uppercase">{label}</span>
      <span className={`text-sm ${bad ? "text-red-300" : good ? "text-mint" : "text-paper"}`}>{text || "—"}</span>
    </div>
  );
}

export default function DiagnosePage() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/diagnose", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) { setError(j.error || "Could not run the check."); return; }
        setData(j);
      })
      .catch(() => setError("Network problem. Reload the page."));
  }, []);

  const copy = () => navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => {});

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between"><Logo /><Link href="/dashboard" className="text-sm text-muted hover:text-paper">← Dashboard</Link></div>
      <h1 className="font-display text-2xl text-paper">Setup check</h1>
      <p className="mt-1 text-sm text-muted">What the server sees for your account and your database. Nothing secret is shown.</p>

      {error && <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</p>}

      {!data && !error && <div className="mt-10 text-center"><span className="spinner mx-auto" /></div>}

      {data && typeof data.verdict === "string" && (
        <p className={`mt-6 rounded-xl border p-4 text-sm ${/FIX/i.test(data.verdict) ? "border-violet-400/40 bg-violet-500/10 text-paper" : "border-mint/30 bg-mint/10 text-mint"}`}>
          {data.verdict}
        </p>
      )}

      {data && (
        <div className="mt-6 space-y-5">
          {Object.entries(data).filter(([k]) => k !== "verdict").map(([section, value]) => (
            <section key={section} className="glass rounded-2xl p-5">
              <h2 className="mb-3 font-display text-base text-paper first-letter:uppercase">
                {section.replace(/([A-Z])/g, " $1").toLowerCase()}
              </h2>
              {typeof value === "object" && value !== null && !Array.isArray(value) ? (
                Object.entries(value as Report).map(([k, v]) => <Row key={k} k={k} v={v} />)
              ) : (
                <p className={`text-sm ${isBad(value) ? "text-red-300" : "text-paper"}`}>
                  {Array.isArray(value) ? (value.length ? value.join(", ") : "none") : String(value)}
                </p>
              )}
            </section>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={copy}><Icon name="copy" size={14} /> Copy this report</button>
        </div>
      )}
    </div>
  );
}
