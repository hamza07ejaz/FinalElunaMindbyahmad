"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "../../lib/supabase/browser";
import { Icon } from "../_components/Icon";
import { Logo } from "../_components/Logo";
import { TOOLS } from "../_components/tools";
import { useUsage } from "../_components/UsageProvider";
import { Bell } from "../_components/Bell";
import { TrialBadge, UpgradeButton, trialDaysLeft } from "../_components/Upgrade";

function NavLink({ href, icon, label, active, locked, onClick }: { href: string; icon: Parameters<typeof Icon>[0]["name"]; label: string; active: boolean; locked?: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-white/10 text-paper" : "text-muted hover:bg-white/5 hover:text-paper"}`}>
      {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-s2 to-s5" />}
      <Icon name={icon} size={18} className={active ? "text-lamp" : ""} />
      <span className="flex-1 truncate">{label}</span>
      {locked && <Icon name="lock" size={13} className="text-mute/70" />}
    </Link>
  );
}

function UsageMeter() {
  const { planName, paid, usage, onTrial, trialEndsAt } = useUsage();
  // On a paid plan the per-tool bars are noise, so only chat is metered there.
  const rows = TOOLS.filter((t) => !usage[t.key].locked && (paid ? t.key === "chat" : true));
  const totalUsed = rows.reduce((a, t) => a + usage[t.key].used, 0);
  const totalLimit = rows.reduce((a, t) => a + usage[t.key].limit, 0);
  const pct = totalLimit ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0;
  const R = 22, C = 2 * Math.PI * R;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-3">
        <svg width="54" height="54" viewBox="0 0 54 54" className="shrink-0 -rotate-90" aria-hidden="true">
          <circle cx="27" cy="27" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
          <circle cx="27" cy="27" r={R} fill="none" stroke="url(#ringg)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)" }} />
          <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-paper">{onTrial ? `${planName} trial` : planName}</p>
          <p className="text-xs text-muted">
            {onTrial
              ? `${trialDaysLeft(trialEndsAt)} day${trialDaysLeft(trialEndsAt) === 1 ? "" : "s"} left · ${pct}% of today's limit used`
              : `${pct}% of today's ${paid ? "chat" : "free"} limit used`}
          </p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {rows.map((t) => {
          const u = usage[t.key];
          const w = u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0;
          return (
            <li key={t.key}>
              <div className="mb-1 flex justify-between text-[0.72rem] text-muted"><span>{t.short}</span><span>{u.used}/{u.limit}</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-s2 to-s5" style={{ width: `${w}%`, transition: "width .6s ease" }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[0.68rem] text-mute/80">Limits reset every day.</p>
      {onTrial && (
        <div className="mt-3 space-y-2">
          <p className="text-[0.68rem] text-mute/80">When the trial ends you keep the Free plan — nothing is charged.</p>
          <UpgradeButton label={`Keep ${planName}`} className="btn btn-primary btn-sm w-full" />
        </div>
      )}
      {!onTrial && !paid && <div className="mt-3"><UpgradeButton className="btn btn-primary btn-sm w-full" /></div>}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { usage, email, planName, paid, role, onTrial, supportEnabled } = useUsage();
  const free = TOOLS.filter((t) => !t.premium && t.key !== "chat");
  const prem = TOOLS.filter((t) => t.premium);
  const is = (href: string) => pathname === href;

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between px-1 pt-1"><Logo href="/dashboard" size={32} /><Bell /></div>
      <nav className="space-y-1">
        <NavLink href="/dashboard" icon="home" label="Dashboard" active={is("/dashboard")} onClick={onNavigate} />
        <NavLink href="/dashboard/chat" icon="chat" label="AI Tutor Chat" active={is("/dashboard/chat")} onClick={onNavigate} />
        <NavLink href="/dashboard/files" icon="folder" label="My Files" active={is("/dashboard/files")} onClick={onNavigate} />
        <NavLink href="/dashboard/account" icon="user" label="Your account" active={is("/dashboard/account")} onClick={onNavigate} />
        {supportEnabled !== false && (
          <NavLink href="/dashboard/support" icon="help" label="Help & support" active={is("/dashboard/support")} onClick={onNavigate} />
        )}
      </nav>
      <div>
        <p className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-mute/70">Study tools</p>
        <nav className="space-y-1">
          {free.map((t) => <NavLink key={t.key} href={`/dashboard/${t.slug}`} icon={t.icon} label={t.title} active={is(`/dashboard/${t.slug}`)} onClick={onNavigate} />)}
        </nav>
      </div>
      <div>
        <p className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-wider text-mute/70">Premium tools</p>
        <nav className="space-y-1">
          {prem.map((t) => <NavLink key={t.key} href={`/dashboard/${t.slug}`} icon={t.icon} label={t.title} active={is(`/dashboard/${t.slug}`)} locked={usage[t.key].locked} onClick={onNavigate} />)}
        </nav>
      </div>
      <div className="mt-auto space-y-3 pt-2">
        {(role === "admin" || role === "sub_admin") && (
          <Link href="/admin" className="flex items-center gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2.5 text-sm text-lamp transition hover:bg-violet-500/15">
            <Icon name="shield" size={18} /> {role === "admin" ? "Admin panel" : "Staff panel"}
          </Link>
        )}
        <UsageMeter />
        <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-s2 to-s5 text-sm font-semibold text-paper">{(email[0] || "U").toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-paper">{email.split("@")[0] || "You"}</p><p className="truncate text-xs text-muted">{onTrial ? `${planName} trial` : planName}</p></div>
          <button type="button" onClick={logout} title="Log out" className="rounded-lg p-2 text-muted transition hover:bg-white/10 hover:text-paper"><Icon name="logout" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="lamp-glow -left-24 top-0 h-80 w-80 bg-violet-500/15" />
        <div className="lamp-glow -right-24 bottom-0 h-96 w-96 bg-indigo-500/18" style={{ animationDelay: "-6s" }} />
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/[0.07] bg-[#090912]/80 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/[0.07] bg-[#07070d]/80 px-4 backdrop-blur-xl lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 text-paper/85 hover:bg-white/10"><Icon name="menu" size={22} /></button>
        <Logo href="/dashboard" size={28} />
        <Bell className="ml-auto" />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="pop-in absolute inset-y-0 left-0 w-[85%] max-w-xs border-r border-white/10 bg-[#0a0a14]">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-3 z-10 rounded-lg p-2 text-muted hover:bg-white/10"><Icon name="x" size={20} /></button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main id="main" className="lg:pl-72">{children}</main>
    </div>
  );
}
