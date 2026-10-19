"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Card, Empty, Loading, Page, Pill, useToast } from "../ui";
import {
  CATEGORY_LABEL, MAX_BODY, STATUS_LABEL, STATUSES,
  type Category, type MessageRow, type Status,
} from "../../../lib/support-shared";

type Ticket = {
  id: string; user_id: string; email: string | null; subject: string;
  category: Category; status: Status; created_at: string; last_reply_at: string;
  unread_for_staff: boolean;
};

type Profile = { plan: string; status: string; role: string; created_at: string; trial_ends_at: string | null } | null;

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  if (mins < 10080) return `${Math.round(mins / 1440)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const FILTERS: { v: string; l: string }[] = [
  { v: "", l: "Live queue" },
  ...STATUSES.map((s) => ({ v: s, l: STATUS_LABEL[s] })),
];

export default function AdminSupportPage() {
  const { toast, toastNode } = useToast();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [counts, setCounts] = useState({ waiting: 0, open: 0 });
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");

  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profile, setProfile] = useState<Profile>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setTickets(null);
    try {
      const sp = new URLSearchParams();
      if (filter) sp.set("status", filter);
      if (q.trim()) sp.set("q", q.trim());
      const r = await fetch(`/api/admin/support?${sp}`, { cache: "no-store" });
      if (!r.ok) { setTickets([]); toast("Could not load the queue.", true); return; }
      const j = await r.json();
      setTickets(j.tickets ?? []);
      setCounts({ waiting: j.waiting ?? 0, open: j.open ?? 0 });
    } catch { setTickets([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);

  async function open(t: Ticket) {
    setActive(t); setMessages([]); setProfile(null); setReply("");
    try {
      const r = await fetch(`/api/admin/support/${t.id}`, { cache: "no-store" });
      if (!r.ok) { toast("Could not open that ticket.", true); return; }
      const j = await r.json();
      setActive(j.ticket); setMessages(j.messages ?? []); setProfile(j.profile ?? null);
      setTickets((list) => (list ?? []).map((x) => (x.id === t.id ? { ...x, unread_for_staff: false } : x)));
      setCounts((c) => ({ ...c, waiting: t.unread_for_staff ? Math.max(0, c.waiting - 1) : c.waiting }));
    } catch { toast("Could not open that ticket.", true); }
  }

  async function send(status?: Status) {
    if (!active) return;
    if (!reply.trim() && !status) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/support/${active.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() || undefined, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "Could not send.", true); return; }
      setReply("");
      setMessages(j.messages ?? messages);
      setActive({ ...active, status: j.status ?? active.status });
      toast(reply.trim() ? "Reply sent." : `Marked ${STATUS_LABEL[j.status as Status] ?? "updated"}.`);
      void load();
    } catch { toast("Network problem. Nothing was sent.", true); }
    finally { setBusy(false); }
  }

  return (
    <Page
      title="Support inbox"
      sub={counts.open ? `${counts.waiting} waiting on a reply · ${counts.open} open` : "Nothing in the queue."}
      actions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}><Icon name="refresh" size={14} /> Refresh</button>}
    >
      {toastNode}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-white/[0.06] p-1">
          {FILTERS.map((f) => (
            <button key={f.v} type="button" onClick={() => { setActive(null); setFilter(f.v); }}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${filter === f.v ? "bg-white/10 text-paper" : "text-muted hover:text-paper"}`}>
              {f.l}
            </button>
          ))}
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <input className="input !w-56 !py-1.5 !text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search subject or email" />
          <button type="submit" className="btn btn-ghost btn-sm"><Icon name="search" size={14} /> Search</button>
        </form>
      </div>

      {active ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="min-w-0">
              <button type="button" className="btn btn-ghost btn-sm mb-2" onClick={() => setActive(null)}>
                <Icon name="arrow" size={14} /> Back to the queue
              </button>
              <h2 className="truncate font-display text-lg text-paper">{active.subject}</h2>
              <p className="mt-0.5 text-xs text-muted">
                {active.email ?? "unknown email"} · {CATEGORY_LABEL[active.category]} · opened {when(active.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {profile && (
                <>
                  <Pill tone={profile.plan === "premium" ? "premium" : profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date() ? "trial" : "free"}>
                    {profile.plan === "premium" ? "Premium" : profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date() ? "On trial" : "Free"}
                  </Pill>
                  {profile.status === "blocked" && <Pill tone="blocked">Blocked</Pill>}
                </>
              )}
              <Pill tone={active.status === "closed" ? "draft" : active.status === "answered" ? "live" : "premium"}>
                {STATUS_LABEL[active.status]}
              </Pill>
            </div>
          </div>

          <div ref={threadRef} className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 && <Empty>Loading the conversation…</Empty>}
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.author === "staff" ? "justify-end" : ""}`}>
                {m.author === "user" && (
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-muted">
                    <Icon name="user" size={15} />
                  </span>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.93rem] ${
                  m.author === "staff" ? "rounded-br-md border border-lamp/25 bg-lamp/10 text-paper" : "rounded-bl-md border border-white/10 bg-white/[0.05] text-paper/90"
                }`}>
                  <p className="mb-1 text-[0.68rem] uppercase tracking-wider text-mute/80">
                    {m.author === "staff" ? (m.author_email ?? "Staff") : "User"} · {when(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <textarea className="input" rows={4} maxLength={MAX_BODY} value={reply} onChange={(e) => setReply(e.target.value)}
              placeholder="Write the reply the user will see…" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={() => void send()}>
                {busy ? <><span className="spinner" /> Sending…</> : <><Icon name="send" size={14} /> Send reply</>}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send("closed")}>
                <Icon name="check" size={14} /> {reply.trim() ? "Send and close" : "Close ticket"}
              </button>
              {active.status === "closed" && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void send("open")}>
                  <Icon name="refresh" size={14} /> Reopen
                </button>
              )}
              <span className="text-xs text-muted">The user is notified in the app, not by email.</span>
            </div>
          </div>
        </Card>
      ) : tickets === null ? (
        <Loading rows={5} />
      ) : tickets.length === 0 ? (
        <Card><Empty>{filter ? "Nothing with that status." : "The queue is empty. Nice."}</Empty></Card>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => open(t)} className="glass card-hover flex w-full items-center gap-3 rounded-2xl p-3.5 text-left">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lamp">
                  <Icon name="inbox" size={17} />
                  {t.unread_for_staff && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-lamp ring-2 ring-[#0a0f1f]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-paper">{t.subject}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {t.email ?? "unknown"} · {CATEGORY_LABEL[t.category]} · {when(t.last_reply_at)}
                  </span>
                </span>
                <Pill tone={t.status === "closed" ? "draft" : t.status === "answered" ? "live" : "premium"}>
                  {STATUS_LABEL[t.status]}
                </Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
