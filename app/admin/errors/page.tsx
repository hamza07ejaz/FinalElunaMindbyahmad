"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Confirm, Empty, Loading, Page, Pill, useToast } from "../ui";
import { LEVEL_COLOR, LEVEL_LABEL, LevelRows, RouteBars, Sparkline, TrendChart, type TrendPoint } from "./charts";

type Group = {
  fingerprint: string; level: string; source: string; name: string | null;
  message: string; route: string | null; occurrences: number;
  first_seen_at: string; last_seen_at: string; status: string;
  note: string | null; users_hit: number;
};

type Overview = {
  days: number;
  total_24h: number; total_prev_24h: number; total_window: number;
  users_hit: number; groups_open: number; groups_total: number;
  newest: string | null;
  series: TrendPoint[];
  by_level: Record<string, number>;
  by_source: Record<string, number>;
  top_routes: { route: string; n: number }[];
};

type Occurrence = {
  id: number; created_at: string; level: string; source: string;
  route: string | null; method: string | null; status: number | null;
  user_email: string | null; user_agent: string | null;
  stack: string | null; context: Record<string, unknown> | null;
};

type Detail = {
  group: Group & { resolved_at: string | null };
  users_hit: number;
  last_14_days: { day: string; n: number }[];
  occurrences: Occurrence[];
};

const RANGES = [
  { v: 1, l: "24 hours" },
  { v: 7, l: "7 days" },
  { v: 14, l: "14 days" },
  { v: 30, l: "30 days" },
];

const STATUS_TABS = [
  { v: "open", l: "Open" },
  { v: "resolved", l: "Resolved" },
  { v: "ignored", l: "Ignored" },
  { v: "all", l: "Everything" },
];

const when = (iso: string | null) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  if (mins < 10080) return `${Math.round(mins / 1440)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const fmt = (n: number) => n.toLocaleString();

function LevelTag({ level }: { level: string }) {
  // Dot plus written label: the colour never carries the meaning on its own.
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-paper/85">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[level] ?? "#94a0bd" }} />
      {LEVEL_LABEL[level] ?? level}
    </span>
  );
}

/** Headline tile. The number is the point; the sparkline is only the shape. */
function Tile({ label, value, hint, trend, tone }:
  { label: string; value: string; hint?: string; trend?: number[]; tone?: "up" | "down" | "flat" }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl leading-none text-paper tabular-nums">{value}</p>
          {hint && (
            <p className={`mt-1.5 text-xs ${tone === "up" ? "text-red-200" : tone === "down" ? "text-mint" : "text-muted"}`}>
              {tone === "up" ? "↑ " : tone === "down" ? "↓ " : ""}{hint}
            </p>
          )}
        </div>
        {trend && trend.length > 1 && <Sparkline values={trend} />}
      </div>
    </div>
  );
}

export default function ErrorsPage() {
  const { toast, toastNode } = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [total, setTotal] = useState(0);
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);

  const [days, setDays] = useState(14);
  const [status, setStatus] = useState("open");
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [open, setOpen] = useState<Detail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const limit = 30;

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setSetupNeeded(null);
    try {
      const sp = new URLSearchParams({
        days: String(days), status, level, source, q: search,
        page: String(page), limit: String(limit),
      });
      const r = await fetch(`/api/admin/errors?${sp}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.setupNeeded) setSetupNeeded(j.error);
        else toast(j.error || "Could not load the error data.", true);
        setGroups([]); setOverview(null);
        return;
      }
      setOverview(j.overview); setGroups(j.groups ?? []); setTotal(j.total ?? 0);
    } catch {
      toast("Network problem. Reload the page to try again.", true);
      setGroups([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, status, level, source, search, page]);

  useEffect(() => { setGroups(null); void load(); }, [load]);

  async function openGroup(fp: string) {
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/admin/errors/${encodeURIComponent(fp)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "Could not open that error.", true); return; }
      setOpen(j);
    } catch { toast("Could not open that error.", true); }
    finally { setLoadingDetail(false); }
  }

  async function patch(payload: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/errors", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "That did not save.", true); return; }
      toast(okMsg);
      if (open && typeof payload.fingerprint === "string") await openGroup(payload.fingerprint);
      await load();
    } catch { toast("Network problem. Nothing changed.", true); }
    finally { setBusy(false); setAsk(false); }
  }

  /* ---------------- migration not run yet ---------------- */
  if (setupNeeded)
    return (
      <Page title="Errors" sub="Crash reports from the server and from people's browsers.">
        {toastNode}
        <Card>
          <div className="mx-auto max-w-lg py-8 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15 text-lamp">
              <Icon name="ban" size={22} />
            </div>
            <h2 className="font-display text-lg text-paper">One migration to run first</h2>
            <p className="mt-2 text-sm text-muted">{setupNeeded}</p>
            <code className="mt-4 inline-block rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-paper/85">
              supabase/008_errors_and_billing.sql
            </code>
            <div className="mt-6"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
              <Icon name="refresh" size={14} /> Check again
            </button></div>
          </div>
        </Card>
      </Page>
    );

  /* ---------------- one problem, in full ---------------- */
  if (open) {
    const g = open.group;
    const trend = open.last_14_days.map((d) => d.n);
    return (
      <Page
        title="Error detail"
        sub={g.route ?? "no route recorded"}
        actions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>
          <Icon name="arrow" size={14} /> Back to all errors
        </button>}
      >
        {toastNode}

        <Card className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <LevelTag level={g.level} />
                <Pill tone={g.source === "client" ? "staff" : "admin"}>{g.source === "client" ? "Browser" : "Server"}</Pill>
                <Pill tone={g.status === "open" ? "premium" : g.status === "resolved" ? "live" : "draft"}>
                  {g.status === "open" ? "Open" : g.status === "resolved" ? "Resolved" : "Ignored"}
                </Pill>
              </div>
              <h2 className="break-words font-display text-lg text-paper">{g.name ? `${g.name}: ` : ""}{g.message}</h2>
              <p className="mt-1.5 text-xs text-muted">
                {fmt(g.occurrences)} {g.occurrences === 1 ? "time" : "times"} ·
                {" "}{fmt(open.users_hit)} {open.users_hit === 1 ? "person" : "people"} affected ·
                {" "}first {when(g.first_seen_at)} · last {when(g.last_seen_at)}
              </p>
              <code className="mt-2 inline-block text-[0.68rem] text-mute/70">{g.fingerprint}</code>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {g.status !== "resolved" && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => patch({ fingerprint: g.fingerprint, status: "resolved" }, "Marked resolved.")}>
                  <Icon name="check" size={14} /> Mark resolved
                </button>
              )}
              {g.status !== "ignored" && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => patch({ fingerprint: g.fingerprint, status: "ignored" }, "Ignored.")}>
                  <Icon name="ban" size={14} /> Ignore
                </button>
              )}
              {g.status !== "open" && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => patch({ fingerprint: g.fingerprint, status: "open" }, "Reopened.")}>
                  <Icon name="refresh" size={14} /> Reopen
                </button>
              )}
            </div>
          </div>

          {g.status === "resolved" && (
            <p className="mt-4 rounded-xl border border-mint/25 bg-mint/10 p-3 text-xs text-mint">
              Resolved. If it happens again it reopens itself, so you will see it back in the Open list.
            </p>
          )}

          {trend.some((n) => n > 0) && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="mb-2 text-xs text-muted">Last 14 days</p>
              <TrendChart data={open.last_14_days.map((d) => ({ day: d.day, total: d.n }))} height={150} />
            </div>
          )}
        </Card>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Most recent {open.occurrences.length === 1 ? "occurrence" : `${open.occurrences.length} occurrences`}
        </h2>

        {open.occurrences.length === 0 ? (
          <Card><Empty>The detail rows for this problem have been pruned. The count above is still accurate.</Empty></Card>
        ) : (
          <div className="space-y-3">
            {open.occurrences.map((o) => (
              <Card key={o.id} className="!p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="text-paper/85">{new Date(o.created_at).toLocaleString()}</span>
                  {o.method && o.route && <code>{o.method} {o.route}</code>}
                  {o.status && <span>HTTP {o.status}</span>}
                  {o.user_email && <span>{o.user_email}</span>}
                </div>
                {o.user_agent && <p className="mt-2 truncate text-[0.68rem] text-mute/70">{o.user_agent}</p>}
                {o.context && Object.keys(o.context).length > 0 && (
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-white/[0.04] p-2.5 text-[0.68rem] text-paper/75">
                    {JSON.stringify(o.context, null, 2)}
                  </pre>
                )}
                {o.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-lamp/90 hover:text-lamp">Stack trace</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-white/[0.04] p-3 text-[0.7rem] leading-relaxed text-paper/80">
                      {o.stack}
                    </pre>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </Page>
    );
  }

  /* ---------------- the dashboard ---------------- */
  const o = overview;
  const delta = o ? o.total_24h - o.total_prev_24h : 0;
  const trendValues = o?.series.map((s) => s.total) ?? [];

  return (
    <Page
      title="Errors"
      sub={o?.newest ? `Most recent ${when(o.newest)}.` : "Crash reports from the server and from people's browsers."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(true)}>
            <Icon name="trash" size={14} /> Prune old
          </button>
        </div>
      }
    >
      {toastNode}

      {/* range picker, one row above the charts */}
      <div className="mb-5 inline-flex rounded-xl bg-white/[0.06] p-1">
        {RANGES.map((r) => (
          <button key={r.v} type="button" onClick={() => setDays(r.v)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${days === r.v ? "bg-white/10 text-paper" : "text-muted hover:text-paper"}`}>
            {r.l}
          </button>
        ))}
      </div>

      {!o ? (
        <Loading rows={4} />
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              label="Last 24 hours" value={fmt(o.total_24h)} trend={trendValues}
              // Kept short: a two-line hint pushes the sparkline out of the tile.
              hint={o.total_prev_24h || o.total_24h
                ? `${fmt(Math.abs(delta))} vs yesterday`
                : "quiet for two days"}
              tone={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
            />
            <Tile label="Open problems" value={fmt(o.groups_open)} hint={`${fmt(o.groups_total)} tracked in total`} />
            <Tile label={`People affected (${o.days}d)`} value={fmt(o.users_hit)}
              hint={o.users_hit ? "signed-in users who hit one" : "nobody signed in was affected"} />
            <Tile label={`All reports (${o.days}d)`} value={fmt(o.total_window)}
              hint={`${fmt(o.by_source.server ?? 0)} server · ${fmt(o.by_source.client ?? 0)} browser`} />
          </div>

          <Card className="mb-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-base text-paper">Errors per day</h2>
              <p className="text-xs text-muted">Hover or use the arrow keys for a day&apos;s breakdown.</p>
            </div>
            <TrendChart data={o.series} />
          </Card>

          <div className="mb-6 grid gap-5 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-display text-base text-paper">Where they happen</h2>
              <RouteBars rows={o.top_routes} />
            </Card>
            <Card>
              <h2 className="mb-4 font-display text-base text-paper">How serious</h2>
              <LevelRows counts={o.by_level} />
              <p className="mt-4 border-t border-white/10 pt-3 text-xs text-muted">
                Fatal means the request died without being handled. Error means a route caught it and told the user something.
              </p>
            </Card>
          </div>
        </>
      )}

      {/* ---- the list ---- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-white/[0.06] p-1">
          {STATUS_TABS.map((t) => (
            <button key={t.v} type="button" onClick={() => { setStatus(t.v); setPage(0); }}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${status === t.v ? "bg-white/10 text-paper" : "text-muted hover:text-paper"}`}>
              {t.l}
            </button>
          ))}
        </div>
        <select className="input !w-auto !py-1.5 !text-sm" value={level} onChange={(e) => { setLevel(e.target.value); setPage(0); }} aria-label="Filter by level">
          <option value="all">Any level</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warn">Warning</option>
        </select>
        <select className="input !w-auto !py-1.5 !text-sm" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }} aria-label="Filter by source">
          <option value="all">Server and browser</option>
          <option value="server">Server only</option>
          <option value="client">Browser only</option>
        </select>
        <label className="relative block min-w-48 flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !py-1.5 !pl-9 !text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search message or route…" />
        </label>
      </div>

      {groups === null ? (
        <Loading rows={5} />
      ) : groups.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-mint/15 text-mint">
              <Icon name="check" size={22} />
            </div>
            <p className="text-sm font-medium text-paper">
              {status === "open" && level === "all" && source === "all" && !search
                ? "Nothing open. The app is behaving."
                : "Nothing matches those filters."}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <ul className="space-y-2">
            {groups.map((g) => (
              <li key={g.fingerprint}>
                <button type="button" disabled={loadingDetail} onClick={() => openGroup(g.fingerprint)}
                  className="glass card-hover flex w-full items-start gap-3 rounded-2xl p-3.5 text-left disabled:opacity-60">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[g.level] ?? "#94a0bd" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-paper">
                      {g.name ? `${g.name}: ` : ""}{g.message}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>{LEVEL_LABEL[g.level] ?? g.level}</span>
                      <span>{g.source === "client" ? "browser" : "server"}</span>
                      {g.route && <code className="truncate">{g.route}</code>}
                      <span>{when(g.last_seen_at)}</span>
                      {g.users_hit > 0 && <span>{fmt(g.users_hit)} affected</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-lg leading-none text-paper tabular-nums">{fmt(g.occurrences)}</span>
                    <span className="text-[0.68rem] text-muted">{g.occurrences === 1 ? "time" : "times"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {total > limit && (
            <div className="mt-5 flex items-center justify-between">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="text-sm text-muted">Page {page + 1} of {Math.ceil(total / limit)}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      <Confirm
        open={ask}
        title="Prune old error data?"
        message="Occurrence rows older than 30 days are deleted, along with resolved and ignored problems nobody has seen since. The counts on recent problems are unaffected."
        confirmLabel="Prune"
        onCancel={() => setAsk(false)}
        onConfirm={() => patch({ prune: true, keepDays: 30 }, "Old error data pruned.")}
      />
    </Page>
  );
}
