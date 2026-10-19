"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../_components/Icon";
import { ErrorBox, Field, Panel } from "../../_components/ToolUI";
import { useUsage } from "../../_components/UsageProvider";
import {
  CATEGORY_LABEL, MAX_BODY, MAX_SUBJECT, STATUS_LABEL,
  type Category, type MessageRow, type Status,
} from "../../../lib/support-shared";

type Ticket = {
  id: string; subject: string; category: Category; status: Status;
  created_at: string; last_reply_at: string; unread_for_user?: boolean;
};

const CATS = Object.keys(CATEGORY_LABEL) as Category[];

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  if (mins < 10080) return `${Math.round(mins / 1440)} d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const STATUS_STYLE: Record<Status, string> = {
  open: "chip-brand",
  answered: "chip-ok",
  closed: "",
};

export default function SupportPage() {
  const { email, plan, onTrial } = useUsage();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [supportEmail, setSupportEmail] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [reply, setReply] = useState("");

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/support", { cache: "no-store" });
      if (r.status === 401) { window.location.href = "/login?next=/dashboard/support"; return; }
      if (!r.ok) { setTickets([]); return; }
      const j = await r.json();
      setTickets(j.tickets ?? []);
      setSupportEmail(j.supportEmail ?? "");
      setEnabled(j.enabled !== false);
    } catch { setTickets([]); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function open(t: Ticket) {
    setError(null); setActive(t); setMessages([]); setComposing(false);
    try {
      const r = await fetch(`/api/support/${t.id}`, { cache: "no-store" });
      if (!r.ok) { setError("Could not open that ticket."); return; }
      const j = await r.json();
      setActive(j.ticket); setMessages(j.messages ?? []);
      setTickets((list) => (list ?? []).map((x) => (x.id === t.id ? { ...x, unread_for_user: false } : x)));
    } catch { setError("Could not open that ticket."); }
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, category, message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "Could not open your ticket."); return; }
      setSubject(""); setMessage(""); setCategory("other"); setComposing(false);
      await load();
      if (j.ticket) await open(j.ticket);
    } catch { setError("Network problem. Nothing was sent."); }
    finally { setBusy(false); }
  }

  async function send() {
    if (!active || !reply.trim()) return;
    setBusy(true); setError(null);
    const text = reply;
    try {
      const r = await fetch(`/api/support/${active.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "Could not send your message."); return; }
      setReply("");
      setMessages(j.messages ?? []);
      setActive({ ...active, status: "open" });
      void load();
    } catch { setError("Network problem. Your message was not sent."); }
    finally { setBusy(false); }
  }

  async function close() {
    if (!active) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/support/${active.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ close: true }),
      });
      if (r.ok) { setActive({ ...active, status: "closed" }); void load(); }
    } finally { setBusy(false); }
  }

  return (
    <div className="page-enter mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-9">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-paper"
          style={{ background: "linear-gradient(135deg, #22c55e, #06b6d4)", boxShadow: "0 12px 30px -12px #22c55e" }}>
          <Icon name="help" size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-paper">Help &amp; support</h1>
          <p className="text-sm text-muted">Ask us anything about your account, your plan or something that is not working.</p>
        </div>
        {!active && enabled && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setComposing(true); setError(null); }}>
            <Icon name="plus" size={15} /> New ticket
          </button>
        )}
      </header>

      {!enabled && (
        <Panel className="mb-5">
          <p className="text-sm text-paper/85">
            In-app tickets are switched off right now.{supportEmail ? <> Email <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> and we will answer there.</> : null}
          </p>
        </Panel>
      )}

      <div className="mb-5"><ErrorBox error={error} /></div>

      {/* ---------- new ticket ---------- */}
      {composing && (
        <Panel className="pop-in mb-5">
          <div className="space-y-4">
            <Field label="What is this about?">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </Field>
            <Field label="Subject" hint={`${subject.length}/${MAX_SUBJECT}`}>
              <input className="input" maxLength={MAX_SUBJECT} value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. My Premium upgrade did not apply" />
            </Field>
            <Field label="Tell us what happened" hint={`${message.length}/${MAX_BODY}`}>
              <textarea className="input" rows={6} maxLength={MAX_BODY} value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder="What you were doing, what you expected, and what happened instead. Any error message helps." />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={busy || subject.trim().length < 3 || message.trim().length < 10} onClick={create}>
                {busy ? <><span className="spinner" /> Sending…</> : <><Icon name="send" size={15} /> Send ticket</>}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setComposing(false); setError(null); }}>Cancel</button>
              <span className="text-xs text-muted">We reply to {email || "your account email"}. Usually within a day.</span>
            </div>
          </div>
        </Panel>
      )}

      {/* ---------- one thread ---------- */}
      {active && (
        <Panel className="pop-in mb-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="min-w-0">
              <button type="button" className="btn btn-ghost btn-sm mb-2" onClick={() => { setActive(null); setMessages([]); }}>
                <Icon name="arrow" size={14} /> All tickets
              </button>
              <h2 className="truncate font-display text-lg text-paper">{active.subject}</h2>
              <p className="mt-0.5 text-xs text-muted">
                {CATEGORY_LABEL[active.category]} · opened {when(active.created_at)}
              </p>
            </div>
            <span className={`chip ${STATUS_STYLE[active.status]}`}>{STATUS_LABEL[active.status]}</span>
          </div>

          <div ref={threadRef} className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.author === "user" ? "justify-end" : ""}`}>
                {m.author === "staff" && (
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-lamp/20 text-lamp">
                    <Icon name="shield" size={15} />
                  </span>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[0.93rem] ${
                  m.author === "user" ? "rounded-br-md text-paper" : "rounded-bl-md border border-white/10 bg-white/[0.05] text-paper/90"
                }`} style={m.author === "user" ? { background: "#1b2440" } : undefined}>
                  <p className="mb-1 text-[0.68rem] uppercase tracking-wider text-mute/80">
                    {m.author === "user" ? "You" : "Eluna support"} · {when(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            ))}
            {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">Loading the conversation…</p>}
          </div>

          {active.status === "closed" ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-muted">
              This ticket is closed. If the problem comes back, open a new one and we will pick it up with this history.
            </div>
          ) : (
            <div className="mt-4 border-t border-white/10 pt-4">
              <textarea className="input" rows={3} maxLength={MAX_BODY} value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder="Add anything else that might help…" />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={send}>
                  {busy ? <><span className="spinner" /> Sending…</> : <><Icon name="send" size={14} /> Reply</>}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={close}>
                  <Icon name="check" size={14} /> This is sorted, close it
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ---------- list ---------- */}
      {!active && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Your tickets</h2>
          {tickets === null ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}</div>
          ) : tickets.length === 0 ? (
            <Panel className="text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-lamp"><Icon name="inbox" size={22} /></div>
              <p className="text-sm font-medium text-paper">No tickets yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                Billing questions, a tool behaving oddly, or anything about your account — this is the place.
              </p>
            </Panel>
          ) : (
            <ul className="space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => open(t)} className="glass card-hover flex w-full items-center gap-3 rounded-2xl p-3.5 text-left">
                    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lamp">
                      <Icon name="inbox" size={17} />
                      {t.unread_for_user && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-lamp ring-2 ring-[#0a0a14]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-paper">{t.subject}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {CATEGORY_LABEL[t.category]} · last reply {when(t.last_reply_at)}
                      </span>
                    </span>
                    <span className={`chip shrink-0 ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Panel className="!p-4 mt-6">
            <h3 className="mb-2 text-sm font-semibold text-paper">Before you write in</h3>
            <ul className="space-y-1.5 text-sm text-muted">
              <li>· Hit a daily limit? It resets at midnight UTC — the number left is shown on every tool.</li>
              <li>· A file would not read? Scanned PDFs have no text in them; upload a photo of the page instead.</li>
              <li>· {onTrial ? "Your trial ends on its own and nothing is charged." : plan === "premium" ? "For cancellations, say so here and we will handle it." : "The free plan never charges you."}</li>
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
