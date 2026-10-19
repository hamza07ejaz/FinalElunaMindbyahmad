"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Empty, Loading, Page, Pill } from "../ui";

type Row = {
  id: string; email: string; plan: string; role: string; status: string;
  created_at: string; last_seen_at: string | null;
  trial_ends_at: string | null; on_trial: boolean;
  uses_total: number; uses_today: number; chats: number; notes: number;
};

/** The plan badge has three states now that a trial can grant Premium. */
function PlanPill({ u }: { u: Row }) {
  if (u.plan === "premium") return <Pill tone="premium">Premium</Pill>;
  if (u.on_trial) return <Pill tone="trial">On trial</Pill>;
  return <Pill tone="free">Free</Pill>;
}

function RolePill({ role }: { role: string }) {
  if (role === "admin") return <Pill tone="admin">Admin</Pill>;
  if (role === "sub_admin") return <Pill tone="staff">Sub-admin</Pill>;
  return null;
}

export default function UsersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const limit = 25;

  // wait for a pause in typing before searching
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setError("");
    try {
      const p = new URLSearchParams({ q: search, plan, status, sort, page: String(page), limit: String(limit) });
      const r = await fetch(`/api/admin/users?${p}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error || "Could not load users."); setRows([]); return; }
      setRows(j.users); setTotal(j.total);
    } catch { setError("Network problem. Reload the page to try again."); setRows([]); }
  }, [search, plan, status, sort, page]);

  useEffect(() => { setRows(null); load(); }, [load]);

  const pages = Math.ceil(total / limit);
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }) : "—");

  return (
    <Page title="Users" sub={`${total} ${total === 1 ? "account" : "accounts"} match your filters.`}>
      <Card className="mb-5 !p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block lg:col-span-2">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email…" />
          </label>
          <select className="input" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(0); }} aria-label="Filter by plan">
            <option value="all">All plans</option><option value="free">Free</option><option value="trial">On trial</option><option value="premium">Premium</option>
          </select>
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Filter by status">
            <option value="all">All accounts</option><option value="active">Active</option><option value="blocked">Blocked</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Sort</span>
          {[["recent", "Newest"], ["usage", "Most usage"], ["email", "Email A–Z"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setSort(v); setPage(0); }}
              className={`rounded-lg px-2.5 py-1 transition ${sort === v ? "bg-lamp text-[#07040f]" : "text-muted hover:text-paper"}`}>{l}</button>
          ))}
        </div>
      </Card>

      {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}

      {rows === null ? <Loading rows={6} /> : rows.length === 0 ? (
        <Card><Empty>No users match these filters.</Empty></Card>
      ) : (
        <>
          {/* table on wide screens */}
          <Card className="hidden !p-0 lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 text-left text-xs text-muted">
                <tr>
                  <th className="px-5 py-3 font-normal">User</th>
                  <th className="px-3 py-3 font-normal">Plan</th>
                  <th className="px-3 py-3 font-normal">Today</th>
                  <th className="px-3 py-3 font-normal">All time</th>
                  <th className="px-3 py-3 font-normal">Chats</th>
                  <th className="px-3 py-3 font-normal">Notes</th>
                  <th className="px-3 py-3 font-normal">Joined</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-3">
                      <Link href={`/admin/users/${u.id}`} className="text-paper hover:text-lamp">{u.email || "(no email)"}</Link>
                      <div className="mt-1 flex gap-1.5">
                        <RolePill role={u.role} />
                        {u.status === "blocked" && <Pill tone="blocked">Blocked</Pill>}
                      </div>
                    </td>
                    <td className="px-3 py-3"><PlanPill u={u} /></td>
                    <td className="px-3 py-3 text-paper/85">{u.uses_today}</td>
                    <td className="px-3 py-3 text-paper/85">{u.uses_total}</td>
                    <td className="px-3 py-3 text-muted">{u.chats}</td>
                    <td className="px-3 py-3 text-muted">{u.notes}</td>
                    <td className="px-3 py-3 text-muted">{fmt(u.created_at)}</td>
                    <td className="px-3 py-3 text-right">
                      <Link href={`/admin/users/${u.id}`} className="btn btn-ghost btn-sm">Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* cards on phones */}
          <div className="space-y-3 lg:hidden">
            {rows.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="glass card-hover block rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-paper">{u.email || "(no email)"}</span>
                  <PlanPill u={u} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{u.uses_today} today</span><span>{u.uses_total} all time</span>
                  <span>{u.chats} chats</span><span>{u.notes} notes</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <RolePill role={u.role} />
                  {u.status === "blocked" && <Pill tone="blocked">Blocked</Pill>}
                </div>
              </Link>
            ))}
          </div>

          {pages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="text-sm text-muted">Page {page + 1} of {pages}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
