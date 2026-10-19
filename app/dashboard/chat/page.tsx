"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachButton, AttachedChip, useAttach } from "../../_components/Attach";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { Speak } from "../../_components/Speak";
import { useUsage } from "../../_components/UsageProvider";
import { UpgradeButton } from "../../_components/Upgrade";
import { CopyButton } from "../../_components/ToolUI";
import { ERROR_MARKER, STALL_MS, Stalled, readWithin } from "../../../lib/stream-client";

type Msg = { id: string; role: "user" | "assistant"; content: string; error?: boolean; upgrade?: boolean; file?: string };
type ChatItem = { id: string; title: string; updated_at: string };

const SUGGESTIONS = [
  { t: "Explain simply", d: "Explain photosynthesis like I'm 12", icon: "spark" as const },
  { t: "Quiz me", d: "Quiz me with 5 questions on World War 2", icon: "test" as const },
  { t: "Solve step by step", d: "Solve x² − 5x + 6 = 0 step by step", icon: "notes" as const },
  { t: "Check my reasoning", d: "Here's my answer to a stats question — tell me where my logic goes wrong, don't just correct it", icon: "grammar" as const },
];
const uid = () => Math.random().toString(36).slice(2);

export default function ChatPage() {
  const { usage, refresh, plan } = useUsage();
  const attach = useAttach();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;
  // send() is memoised, so the attached file is read through a ref to stay current.
  const fileRef = useRef(attach.file);
  fileRef.current = attach.file;

  const left = Math.max(0, usage.chat.limit - usage.chat.used);

  const loadChats = useCallback(async () => {
    try { const r = await fetch("/api/chats"); if (r.ok) setChats((await r.json()).chats ?? []); } catch { /* offline */ }
  }, []);

  const openChat = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setStreaming(false); setListOpen(false);
    try {
      const r = await fetch(`/api/chats/${id}`);
      if (!r.ok) return;
      const j = await r.json();
      setActiveId(id);
      setMessages((j.messages ?? []).map((m: { id: string; role: "user" | "assistant"; content: string; file?: string | null }) => ({ id: m.id, role: m.role, content: m.content, file: m.file ?? undefined })));
      stickRef.current = true;
    } catch { /* offline */ }
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || streaming) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    stickRef.current = true;

    const attached = fileRef.current;
    const asstId = uid();
    setMessages((m) => [...m, { id: uid(), role: "user", content: text, file: attached?.name }, { id: asstId, role: "assistant", content: "" }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const patch = (p: Partial<Msg>) => setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, ...p } : x)));

    try {
      // A deadline on the request itself as well as on the stream: a server that
      // never replies at all used to leave this spinning just as long.
      const res = await readWithin(fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeRef.current, message: text, uploadId: attached?.id ?? null }), signal: ctrl.signal,
      }), STALL_MS * 2);
      if (res.status === 401) { window.location.href = "/login?next=/dashboard/chat"; return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        patch({ content: j.error || "Something went wrong. Please try again.", error: true, upgrade: !!j.upgrade });
        refresh();
        return;
      }
      const cid = res.headers.get("x-chat-id");
      if (cid && cid !== activeRef.current) setActiveId(cid);

      if (!res.body) { patch({ content: await res.text() }); }
      else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await readWithin(reader.read(), STALL_MS);
          } catch {
            // Nothing has arrived for half a minute. Keep whatever was said and
            // stop, instead of leaving the user watching a cursor blink.
            ctrl.abort();
            patch(acc.trim()
              ? { content: `${acc}\n\n---\n*The answer was cut off — the connection went quiet. Ask again to carry on.*` }
              : { content: "The AI took too long to answer. Your message was not counted — please try again.", error: true });
            break;
          }
          if (chunk.done) break;
          acc += dec.decode(chunk.value, { stream: true });
          if (acc.includes(ERROR_MARKER.trim())) {
            // The marker only ever arrives when the server has nothing else, but
            // keep any partial text in case that changes.
            const partial = acc.replace(ERROR_MARKER.trim(), "").trim();
            patch(partial
              ? { content: partial }
              : { content: "The AI could not answer right now. Your message was not counted, please try again.", error: true });
            break;
          }
          patch({ content: acc });
        }
      }
    } catch (e) {
      if (e instanceof Stalled) {
        ctrl.abort();
        patch({ content: "The server did not respond. Your message was not counted — please try again.", error: true });
      } else if ((e as Error).name !== "AbortError") {
        patch({ content: "Connection problem. Please try again.", error: true });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refresh();
      loadChats();
    }
  }, [streaming, refresh, loadChats]);

  // first load: history + deep links (?id=…  /  ?q=…)
  useEffect(() => {
    loadChats();
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("id"), q = sp.get("q"), file = sp.get("file");
    if (file) { window.history.replaceState(null, "", "/dashboard/chat"); void attach.adopt(file); }
    if (id) openChat(id);
    else if (q) { window.history.replaceState(null, "", "/dashboard/chat"); send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function newChat() {
    abortRef.current?.abort();
    setActiveId(null); setMessages([]); setStreaming(false); setListOpen(false);
    taRef.current?.focus();
  }
  async function removeChat(id: string) {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    setChats((c) => c.filter((x) => x.id !== id));
    if (activeId === id) newChat();
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {/* conversation list */}
      <aside className={`${listOpen ? "absolute inset-y-14 left-0 z-10 flex w-72" : "hidden"} flex-col border-r border-white/[0.07] bg-[#0a0a14] lg:static lg:flex lg:w-72`}>
        <div className="p-3"><button type="button" onClick={newChat} className="btn btn-primary w-full"><Icon name="plus" size={16} /> New chat</button></div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {chats.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Your conversations will appear here.</p>}
          {chats.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-xl pr-1 transition ${activeId === c.id ? "bg-white/10" : "hover:bg-white/5"}`}>
              <button type="button" onClick={() => openChat(c.id)} className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm text-paper/75 group-hover:text-paper">{c.title}</button>
              <button type="button" onClick={() => removeChat(c.id)} aria-label="Delete chat" className="rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      </aside>

      {/* conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setListOpen((v) => !v)} className="btn btn-ghost btn-sm"><Icon name="history" size={15} /> Chats</button>
          <button type="button" onClick={newChat} className="btn btn-ghost btn-sm"><Icon name="plus" size={15} /> New</button>
        </div>

        <div ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {empty ? (
              <div className="page-enter pt-6 text-center sm:pt-14">
                <div className="float-y mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl text-paper" style={{ background: "var(--lamp)", boxShadow: "0 18px 40px -14px rgba(139,92,246,.9)" }}><Icon name="spark" size={30} /></div>
                <h1 className="text-2xl font-semibold text-paper sm:text-3xl">How can I help you study today?</h1>
                <p className="mt-2 text-sm text-muted">Ask a question, or attach a PDF, slide deck, photo of your notes or a lecture recording and ask about that.</p>
                <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={s.t} type="button" onClick={() => send(s.d)} style={{ animationDelay: `${i * 60}ms` }} className="glass card-hover pop-in rounded-2xl p-4 text-left">
                      <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-lamp"><Icon name={s.icon} size={16} /> {s.t}</span>
                      <span className="text-sm text-paper/75">{s.d}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="space-y-5"
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-label="Conversation"
              >
                {messages.map((m, idx) => {
                  const last = idx === messages.length - 1;
                  return m.role === "user" ? (
                    <div key={m.id} className="pop-in flex flex-col items-end gap-1">
                      {m.file && (
                        <span className="flex max-w-[88%] items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1 text-xs text-paper/70">
                          <Icon name="attach" size={12} /> <span className="truncate">{m.file}</span>
                        </span>
                      )}
                      {/*
                        `break-words` because a student pasting a long token or
                        typing one unbroken word had the end of their own
                        message clipped away — the bubble grew past the screen
                        and the page clips rather than scrolls.
                      */}
                      <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-4 py-3 text-[0.95rem] text-paper" style={{ background: "#1b2440" }}>{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} className="pop-in group flex gap-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-paper" style={{ background: "var(--lamp)" }}><Icon name="spark" size={16} /></span>
                      <div className="min-w-0 flex-1">
                        {m.error ? (
                          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                            {m.content}
                            {m.upgrade && <div className="mt-3"><UpgradeButton label="Get more messages" className="btn btn-primary btn-sm" /></div>}
                          </div>
                        ) : m.content === "" && streaming && last ? (
                          <div className="dots py-3" role="status" aria-label="Thinking"><span /><span /><span /></div>
                        ) : (
                          <div className={streaming && last ? "caret" : ""}><Markdown text={m.content} /></div>
                        )}
                        {!m.error && m.content && !(streaming && last) && (
                          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                            <CopyButton text={m.content} />
                            <Speak text={m.content} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/[0.07] bg-[#07070d]/80 px-4 pb-4 pt-3 backdrop-blur-xl">
          <form className="mx-auto w-full max-w-3xl" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            {attach.file && (
              <>
                <AttachedChip file={attach.file} onClear={attach.clear} />
                {attach.file.kind === "audio" && (
                  <p className="mb-2 px-1 text-xs text-lampsoft/85">
                    A recording has to be transcribed before I can read it —{" "}
                    <Link href={`/dashboard/transcript?file=${attach.file.id}`} className="underline underline-offset-2">open Lecture Transcripts</Link>, then come back.
                  </p>
                )}
              </>
            )}
            {attach.error && (
              <div className="pop-in mb-2 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                <span className="flex-1">{attach.error}</span>
                <button type="button" onClick={() => attach.setError(null)} aria-label="Dismiss"><Icon name="x" size={13} /></button>
              </div>
            )}
            <div className="glass-strong flex items-end gap-2 rounded-2xl p-2 focus-within:border-violet-400/60">
              <AttachButton
                onPick={(f) => { void attach.upload(f); }}
                busy={attach.busy}
                disabled={streaming || attach.left === 0}
                label={undefined}
              />
              <textarea
                ref={taRef} value={input} rows={1} maxLength={2000} placeholder="Message your tutor…" disabled={left === 0 && !streaming}
                className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.95rem] text-paper outline-none placeholder:text-mute/70"
                onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              />
              {streaming ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-ghost h-11 w-11 shrink-0 !p-0" aria-label="Stop"><Icon name="stop" size={18} /></button>
              ) : (
                <button type="submit" disabled={!input.trim() || left === 0} className="btn btn-primary h-11 w-11 shrink-0 !p-0" aria-label="Send"><Icon name="send" size={18} /></button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-xs text-muted">
              <span>
                {left === 0 ? "Daily message limit reached." : `${left} of ${usage.chat.limit} messages left today`}
                {plan !== "premium" && left <= 3 && left > 0 ? " · running low" : ""}
                {attach.left === 0 ? " · no uploads left today" : ` · ${attach.left} uploads left`}
              </span>
              {plan !== "premium" && left <= 5 ? <UpgradeButton label="Get more" className="btn btn-ghost btn-sm" /> : <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>}
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
