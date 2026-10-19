"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Logo } from "../Logo";
import { NavAuth } from "./NavAuth";

type Item = { href: string; label: string };

/**
 * The header.
 *
 * It is a pill from the first paint and tightens over the first 120px of
 * scroll — width, padding and opacity. Where the browser supports scroll-driven
 * animations that runs off the compositor with no JavaScript; elsewhere a
 * passive scroll listener sets the same custom property. Both paths drive the
 * identical CSS, so there is one appearance to maintain, not two.
 */
export function PillNav({ siteName, logoUrl, blogEnabled, notice }:
  { siteName: string; logoUrl: string; blogEnabled: boolean; notice: string }) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const items: Item[] = [
    { href: "/#features", label: "Features" },
    { href: "/#how", label: "How it works" },
    { href: "/pricing", label: "Pricing" },
    ...(blogEnabled ? [{ href: "/blog", label: "Blog" }] : []),
  ];

  useEffect(() => {
    const supported = CSS.supports("(animation-timeline: scroll()) and (animation-range: 0% 100%)");
    if (supported) return;

    // Fallback: the same 0→1 progress the scroll timeline would produce.
    const el = shellRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const t = Math.min(1, Math.max(0, window.scrollY / 120));
      el.style.setProperty("--nav-t", String(t));
      el.style.paddingTop = `${1.15 - 0.7 * t}rem`;
      el.style.paddingBottom = `${1.15 - 0.7 * t}rem`;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);

  // Close the sheet on Escape, and lock the page behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {notice && (
        <div className="relative z-50 bg-violet-500/15 px-4 py-2 text-center text-sm text-lampsoft">{notice}</div>
      )}

      <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
        <div ref={shellRef} className="nav-shell px-4 transition-[padding] duration-200 sm:px-6">
          <nav
            aria-label="Main"
            className="pill-nav pointer-events-auto mx-auto flex items-center gap-2 px-3 py-2 sm:px-4"
            style={{ maxWidth: "min(68rem, 100%)" }}
          >
            <Logo href="/" size={30} logoUrl={logoUrl} siteName={siteName} />

            <ul className="ml-4 hidden items-center gap-1 md:flex">
              {items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href}
                    className="rounded-full px-3.5 py-2 text-sm text-muted transition-colors hover:bg-white/[0.07] hover:text-paper">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden sm:block"><NavAuth /></div>
              <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}
                className="grid h-9 w-9 place-items-center rounded-full text-paper/85 transition hover:bg-white/10 md:hidden">
                <Icon name="menu" size={19} />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* mobile sheet */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[#05060e]/80 backdrop-blur-sm" />
          <div className="page-enter absolute inset-x-3 top-3 rounded-3xl border border-white/10 bg-[#0a0d1c]/95 p-5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <Logo href="/" size={30} logoUrl={logoUrl} siteName={siteName} />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-full text-paper/85 hover:bg-white/10">
                <Icon name="x" size={19} />
              </button>
            </div>
            <ul className="mt-5 space-y-1">
              {items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-base text-paper/90 transition hover:bg-white/[0.06]">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="seam-h my-5" />
            <NavAuth />
          </div>
        </div>
      )}
    </>
  );
}
