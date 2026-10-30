"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../_components/Icon";
import { Logo } from "../_components/Logo";
import { Bell } from "../_components/Bell";
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

  /*
   * What the header says you are looking at.
   *
   * Taken from the nav rather than written twice, so a page added to the nav
   * is named here without anybody remembering to do it. The longest match
   * wins, so /admin/blog/new still reads as Blog instead of Overview.
   */
  const current = [...allowed]
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => isActive(n.href));

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
        {/*
          The bell used to live here, in the corner of the sidebar. Its panel
          opens downward and to the left of the button, which in a 16rem column
          meant most of it opened underneath the page. It belongs in the header
          with the other things you act on.
        */}
        <div className="mb-6 px-1">
          <Logo href="/admin" size={30} />
          <p className="mt-1 text-xs text-lamp">{ROLE_LABEL[role]} panel</p>
        </div>
        {nav}
        {/* "Back to the app" lives in the header now, where it is in sight on
            every screen size rather than only at the foot of the sidebar. */}
        <div className="mt-auto pt-4">
          <p className="truncate px-3 text-xs text-muted" title={email}>{email}</p>
        </div>
      </aside>

      {/*
        One header for both sizes.
        
        There was no header at all above `lg`: the desktop panel was a sidebar
        and then straight into the page, so there was nowhere for the things
        that belong to the whole panel — which is how the bell ended up wedged
        into the sidebar corner. The menu button and the logo are the only
        parts that are phone-only.
      */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-[#0b1020]/85 px-4 backdrop-blur-xl lg:pl-[17.5rem]">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu"
          className="rounded-lg p-2 text-paper/80 hover:bg-white/10 lg:hidden">
          <Icon name={open ? "x" : "menu"} size={22} />
        </button>
        <span className="lg:hidden"><Logo href="/admin" size={26} /></span>

        <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
          {current && <Icon name={current.icon} size={18} className="shrink-0 text-lamp" />}
          <h2 className="truncate font-display text-base text-paper">{current?.label ?? "Admin"}</h2>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canSupport && waiting > 0 && (
            <Link href="/admin/support"
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-paper sm:flex"
              title={`${waiting} message${waiting === 1 ? "" : "s"} waiting for a reply`}>
              <Icon name="inbox" size={15} />
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-lamp px-1.5 text-[0.68rem] font-semibold text-[#07040f]">{waiting}</span>
            </Link>
          )}
          <Bell />
          <span className="chip chip-brand hidden sm:inline-flex">{ROLE_LABEL[role]}</span>
          <Link href="/dashboard"
            className="hidden items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-white/5 hover:text-paper lg:flex"
            title={email}>
            <Icon name="arrow" size={16} /> Back to the app
          </Link>
        </div>
      </header>
      {open && <div className="page-enter border-b border-white/10 p-3 lg:hidden">{nav}</div>}

      <main id="main" className="lg:pl-64">{children}</main>
    </div>
  );
}
