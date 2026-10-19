"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../_components/Icon";
import { Logo } from "../_components/Logo";
import { ROLE_LABEL, type Permission, type Role } from "../../lib/roles";

const NAV: { href: string; label: string; icon: IconName; needs: Permission }[] = [
  { href: "/admin", label: "Overview", icon: "home", needs: "users.view" },
  { href: "/admin/support", label: "Support inbox", icon: "inbox", needs: "support" },
  { href: "/admin/users", label: "Users", icon: "users", needs: "users.view" },
  { href: "/admin/plans", label: "Plans & limits", icon: "zap", needs: "settings" },
  { href: "/admin/branding", label: "Branding & site", icon: "spark", needs: "settings" },
  { href: "/admin/ai", label: "AI keys", icon: "zap", needs: "settings" },
  { href: "/admin/billing", label: "Payments", icon: "cite", needs: "settings" },
  { href: "/admin/site", label: "Website", icon: "globe", needs: "settings" },
  { href: "/admin/pages", label: "Pages", icon: "file", needs: "settings" },
  { href: "/admin/bot", label: "Chat bubble", icon: "chat", needs: "settings" },
  { href: "/admin/blog", label: "Blog", icon: "notes", needs: "blog" },
  { href: "/admin/errors", label: "Errors", icon: "ban", needs: "errors" },
  { href: "/admin/activity", label: "Activity log", icon: "history", needs: "audit" },
];

export function AdminShell({ email, role, permissions, children }:
  { email: string; role: Role; permissions: Permission[]; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(0);
  useEffect(() => { setOpen(false); }, [pathname]);

  const allowed = NAV.filter((n) => permissions.includes(n.needs));
  const canSupport = permissions.includes("support");

  // The unanswered count is the one number worth carrying in the nav.
  useEffect(() => {
    if (!canSupport) return;
    let alive = true;
    fetch("/api/admin/support?limit=5", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setWaiting(j.waiting ?? 0); })
      .catch(() => { /* the badge is a nicety, not worth an error */ });
    return () => { alive = false; };
  }, [canSupport, pathname]);

  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const nav = (
    <nav className="space-y-1">
      {allowed.map((n) => (
        <Link key={n.href} href={n.href}
          className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
            isActive(n.href) ? "bg-white/10 text-paper" : "text-muted hover:bg-white/5 hover:text-paper"
          }`}>
          {isActive(n.href) && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-lamp" />}
          <Icon name={n.icon} size={18} className={isActive(n.href) ? "text-lamp" : ""} />
          <span className="flex-1">{n.label}</span>
          {n.href === "/admin/support" && waiting > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lamp px-1.5 text-[0.68rem] font-semibold text-[#07040f]">{waiting}</span>
          )}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-[#0a0f1f]/80 p-4 backdrop-blur-xl lg:flex">
        <div className="mb-6 px-1"><Logo href="/admin" size={30} /><p className="mt-1 text-xs text-lamp">{ROLE_LABEL[role]} panel</p></div>
        {nav}
        <div className="mt-auto space-y-1 pt-4">
          <p className="truncate px-3 text-xs text-muted">{email}</p>
          <Link href="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-white/5 hover:text-paper">
            <Icon name="arrow" size={18} /> Back to the app
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-[#0b1020]/85 px-4 backdrop-blur-xl lg:hidden">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu" className="rounded-lg p-2 text-paper/80 hover:bg-white/10">
          <Icon name={open ? "x" : "menu"} size={22} />
        </button>
        <Logo href="/admin" size={26} />
        <span className="chip chip-brand ml-auto">{ROLE_LABEL[role]}</span>
      </header>
      {open && <div className="page-enter border-b border-white/10 p-3 lg:hidden">{nav}</div>}

      <main id="main" className="lg:pl-64">{children}</main>
    </div>
  );
}
