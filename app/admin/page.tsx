"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../_components/Icon";
import { Card, Loading, Page, Stat } from "./ui";

type Overview = Record<string, number>;
type Day = { day: string; uses: number; active_users: number; signups: number };
type FeatureRow = { kind: string; uses: number; users: number };

const LABELS: Record<string, string> = {
  chat: "Chat", notes: "Notes", qna: "Q&A", studyPlan: "Study plan", career: "Career", humanize: "Humanize",
  flashcards: "Flashcards", test: "Tests", visualMap: "Mind maps", presentation: "Slides",
  grammar: "Grammar", paraphrase: "Paraphrase", citations: "Citations",
};

/** Usage over time. Bars, because the question is "how much on each day", not a trend line. */
function UsageChart({ series }: { series: Day[] }) {
  const max = Math.max(1, ...series.map((d) => d.uses));
  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-lg text-paper">AI uses per day</h2>
        <span className="text-xs text-muted">{series.length} days</span>
      </div>
      <div className="flex h-44 items-end gap-1.5">
        {series.map((d) => {
          const h = (d.uses / max) * 100;
          return (
            <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end">
              <div className="w-full rounded-t transition-[height] duration-500"
                style={{ height: `${Math.max(h, d.uses ? 3 : 1)}%`, background: d.uses ? "var(--lamp)" : "rgba(255,255,255,.12)" }} />
              <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded-lg border border-white/15 bg-[#121a30] px-2 py-1 text-xs text-paper group-hover:block">
                {d.uses} uses · {d.active_users} users
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{series[0] ? new Date(series[0].day).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}</span>
        <span>Today</span>
      </div>
    </Card>
  );
}

function FeatureBars({ rows }: { rows: FeatureRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.uses));
  return (
    <Card>
      <h2 className="mb-5 font-display text-lg text-paper">Which tools get used</h2>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">No usage recorded yet.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.kind}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-paper/85">{LABELS[r.kind] ?? r.kind}</span>
                <span className="text-muted">{r.uses} · {r.users} {r.users === 1 ? "user" : "users"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-lamp transition-[width] duration-500" style={{ width: `${(r.uses / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState<{ overview: Overview; series: Day[]; features: FeatureRow[] } | null>(null);
  const [days, setDays] = useState(14);
  const [error, setError] = useState("");

  const load = useCallback(async (d: number) => {
    setError("");
    try {
      const r = await fetch(`/api/admin/overview?days=${d}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Could not load analytics."); return; }
      setData(j);
    } catch { setError("Network problem. Reload the page to try again."); }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const o = data?.overview;
  return (
    <Page
      title="Overview"
      sub="How many people are here, what they use, and how hard they use it."
      actions={
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${days === d ? "bg-lamp text-[#07040f]" : "text-muted hover:text-paper"}`}>
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}
      {!data ? <Loading rows={6} /> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total users" value={o!.users_total} hint={`${o!.users_new_today} joined today`} />
            <Stat label="Premium users" value={o!.users_premium}
              hint={o!.users_total ? `${Math.round((o!.users_premium / o!.users_total) * 100)}% of all users` : "—"} />
            <Stat label="On a free trial" value={o!.users_trialing ?? 0}
              hint={o!.trials_started ? `${o!.trials_started} started all time` : "None started yet"} />
            <Stat label="Active today" value={o!.active_today} hint={`${o!.active_7d} in the last 7 days`} />
            <Stat label="AI uses today" value={o!.uses_today} hint={`${o!.uses_total} all time`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <UsageChart series={data.series} />
            <FeatureBars rows={data.features} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Chats started" value={o!.chats_total} />
            <Stat label="Chat messages" value={o!.messages_total} />
            <Stat label="Notes generated" value={o!.notes_total} />
            <Stat label="Blocked accounts" value={o!.users_blocked} />
            <Stat label="Files uploaded" value={o!.uploads_total ?? 0} />
            <Stat label="Open tickets" value={o!.tickets_open ?? 0}
              hint={o!.tickets_waiting ? `${o!.tickets_waiting} waiting on a reply` : "Nothing waiting"} />
          </div>

          <Card>
            <h2 className="mb-3 font-display text-lg text-paper">Quick actions</h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/users" className="btn btn-ghost btn-sm"><Icon name="user" size={14} /> Manage users</Link>
              <Link href="/admin/plans" className="btn btn-ghost btn-sm"><Icon name="zap" size={14} /> Change limits or price</Link>
              <Link href="/admin/blog" className="btn btn-ghost btn-sm"><Icon name="notes" size={14} /> Write a post</Link>
              <Link href="/admin/activity" className="btn btn-ghost btn-sm"><Icon name="history" size={14} /> Activity log</Link>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
