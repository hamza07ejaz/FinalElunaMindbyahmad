"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./Icon";

/**
 * The notification bell, used by both the dashboard and the admin panel.
 *
 * It polls rather than holding a connection open. A realtime subscription
 * would be a websocket per visitor for something nobody is waiting on — a
 * note about a file that finished is just as useful half a minute later, and
 * the free database tier has a connection limit that a few hundred students
 * would reach long before the notifications mattered.
 *
 * Polling stops while the tab is hidden, so a browser left open overnight on
 * a laptop is not still asking every thirty seconds in the morning.
 */

const POLL_MS = 30_000;

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
};

const ICONS: Record<string, IconName> = {
  upload: "file",
  support: "inbox",
  billing: "cite",
  trial: "zap",
  system: "spark",
  signup: "users",
  error: "ban",
};

/** "4m", "3h", "2d" — short enough to sit beside a title. */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

export function Bell({ className = "" }: { className?: string }) {
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setItems(j.items ?? []);
      setUnread(j.unread ?? 0);
    } catch {
      // The bell is not worth an error message.
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => { timer ??= setInterval(() => void load(), POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { void load(); start(); }
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  // Close on a click elsewhere or on Escape, the two things people try.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function markRead(id?: string) {
    // Updated here first: the row is already read as far as the person is
    // concerned, and waiting for a round trip to grey it out feels broken.
    setItems((cur) => cur.map((n) => (!id || n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnread((u) => (id ? Math.max(0, u - 1) : 0));
    try {
      await fetch("/api/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
    } catch { void load(); }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-white/5 hover:text-paper">
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-lamp px-1 text-[0.6rem] font-bold text-[#07040f]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/*
        On a phone the panel is pinned to the viewport, not to the button.
        Anchored to the button it ran off whichever edge the button happened to
        be near — in the admin sidebar it opened behind the page, and on a
        narrow screen most of it sat off to the left where nobody could reach
        it. Pinning it means it fits whatever the screen is, wherever the bell
        sits. From `sm` up there is room to hang it off the button as before.
      */}
      {open && (
        <>
          <button
            type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/40 sm:hidden"
          />
          <div role="dialog" aria-label="Notifications"
            /*
              Solid, not translucent. At 97% over a blur it still let the page
              beneath show through enough to read, so a notification sat on top
              of a heading and neither could be read properly.
            */
            className="pop-in fixed inset-x-3 top-16 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d1c] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
            <p className="text-sm font-medium text-paper">Notifications</p>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button type="button" onClick={() => markRead()} className="text-xs text-lamp hover:underline">
                  Mark all read
                </button>
              )}
              {/* A way out that does not depend on hitting the backdrop. */}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications"
                className="-mr-1 rounded-lg p-1 text-muted hover:bg-white/10 hover:text-paper sm:hidden">
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>

          {/* Tall enough to be worth opening, short enough to stay on screen. */}
          <div className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">Nothing yet.</p>
            )}
            {items.map((n) => {
              const inner = (
                <>
                  <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${n.read_at ? "bg-white/5 text-muted" : "bg-violet-500/20 text-lamp"}`}>
                    <Icon name={ICONS[n.kind] ?? "spark"} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`flex-1 text-sm ${n.read_at ? "text-paper/65" : "font-medium text-paper"}`}>{n.title}</span>
                      <span className="shrink-0 text-[0.65rem] text-muted">{ago(n.created_at)}</span>
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{n.body}</span>}
                  </span>
                </>
              );
              const cls = `flex w-full items-start gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.04] ${n.read_at ? "" : "bg-violet-500/[0.05]"}`;

              return n.href ? (
                <Link key={n.id} href={n.href} className={cls}
                  onClick={() => { if (!n.read_at) void markRead(n.id); setOpen(false); }}>
                  {inner}
                </Link>
              ) : (
                <button key={n.id} type="button" className={cls}
                  onClick={() => { if (!n.read_at) void markRead(n.id); }}>
                  {inner}
                </button>
              );
            })}
          </div>
          </div>
        </>
      )}
    </div>
  );
}
