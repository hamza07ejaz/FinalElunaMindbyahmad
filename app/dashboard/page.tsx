"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../_components/Icon";
import { TOOLS } from "../_components/tools";
import { useUsage } from "../_components/UsageProvider";
import { UpgradeButton } from "../_components/Upgrade";

const PROMPTS = ["Explain photosynthesis in simple words", "Quiz me on the French Revolution", "Help me understand derivatives", "Mujhe Newton ke laws asaan zubaan mein samjhao"];

type Recent = { id: string; title: string };

export default function DashboardHome() {
  const { plan, email, usage } = useUsage();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Recent[]>([]);
  const [chats, setChats] = useState<Recent[]>([]);
  const name = (email.split("@")[0] || "there").replace(/[._-]+/g, " ");
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    fetch("/api/notes").then((r) => r.json()).then((j) => setNotes((j.notes ?? []).slice(0, 4))).catch(() => {});
    fetch("/api/chats").then((r) => r.json()).then((j) => setChats((j.chats ?? []).slice(0, 4))).catch(() => {});
  }, []);

  const ask = (text: string) => { if (text.trim()) router.push(`/dashboard/chat?q=${encodeURIComponent(text.trim())}`); };
  const chatLeft = Math.max(0, usage.chat.limit - usage.chat.used);

  return (
    <div className="page-enter mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <section className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-9">
        <div className="lamp-glow -right-10 -top-16 h-64 w-64 bg-violet-600/50" />
        <div className="lamp-glow -bottom-20 left-1/3 h-56 w-56 bg-indigo-500/18" style={{ animationDelay: "-5s" }} />
        <div className="relative max-w-2xl">
          <span className="chip chip-brand mb-4"><Icon name="spark" size={12} /> {plan === "premium" ? "Premium" : "Free plan"} · {chatLeft} chat messages left today</span>
          <h1 className="text-3xl tracking-tight text-paper sm:text-4xl">{greet}, <span className="capitalize text-lamp">{name}</span></h1>
          <p className="mt-2 text-muted">What would you like to learn today? Ask the tutor, or jump into a tool below.</p>
          <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your AI tutor anything…" maxLength={500} />
            <button className="btn btn-primary shrink-0" type="submit" aria-label="Ask"><Icon name="send" size={18} /><span className="hidden sm:inline">Ask</span></button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button key={p} type="button" onClick={() => ask(p)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-paper/75 transition hover:border-violet-400/50 hover:bg-white/10 hover:text-paper">{p}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-9">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-semibold text-paper">Your study tools</h2>
          {plan !== "premium" && <UpgradeButton label="Unlock all tools" className="btn btn-ghost btn-sm" />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t, i) => {
            const u = usage[t.key];
            return (
              <Link key={t.key} href={`/dashboard/${t.slug}`} className="glass card-hover pop-in group relative overflow-hidden rounded-2xl p-5" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="mb-4 flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl text-paper" style={{ background: `linear-gradient(135deg, ${t.grad[0]}, ${t.grad[1]})`, boxShadow: `0 10px 26px -12px ${t.grad[0]}` }}><Icon name={t.icon} size={22} /></span>
                  {u.locked ? <span className="chip chip-brand"><Icon name="lock" size={11} /> Premium</span> : <span className="chip">{Math.max(0, u.limit - u.used)} left</span>}
                </div>
                <h3 className="font-semibold text-paper">{t.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{t.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-lamp transition-all group-hover:gap-2">Open <Icon name="arrow" size={15} /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-9 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold text-paper"><Icon name="chat" size={18} className="text-lamp" /> Recent chats</h3><Link href="/dashboard/chat" className="text-xs text-lamp hover:underline">Open chat</Link></div>
          {chats.length === 0 ? <p className="py-4 text-sm text-muted">No chats yet. Ask your first question above.</p> : (
            <ul className="space-y-1">{chats.map((c) => <li key={c.id}><Link href={`/dashboard/chat?id=${c.id}`} className="block truncate rounded-lg px-3 py-2 text-sm text-paper/75 hover:bg-white/5 hover:text-paper">{c.title}</Link></li>)}</ul>
          )}
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold text-paper"><Icon name="history" size={18} className="text-lamp/80" /> Recent notes</h3><Link href="/dashboard/notes" className="text-xs text-lamp hover:underline">All notes</Link></div>
          {notes.length === 0 ? <p className="py-4 text-sm text-muted">Your generated notes will be saved here.</p> : (
            <ul className="space-y-1">{notes.map((n) => <li key={n.id}><Link href={`/dashboard/notes?id=${n.id}`} className="block truncate rounded-lg px-3 py-2 text-sm text-paper/75 hover:bg-white/5 hover:text-paper">{n.title}</Link></li>)}</ul>
          )}
        </div>
      </section>
    </div>
  );
}
