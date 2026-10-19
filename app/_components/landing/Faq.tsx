"use client";
import { useState } from "react";
import { Icon } from "../Icon";
import type { FaqItem } from "../../../lib/content";

/**
 * The questions, written in the admin panel.
 *
 * Built on <details>, so every answer is in the page and findable by search
 * and by Ctrl+F whether or not it is open — an accordion that hides its own
 * content from the browser is worse than no accordion.
 */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState(0);

  if (!items.length) return null;

  return (
    <div className="mx-auto max-w-2xl">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="border-b border-white/[0.07]">
            <h3>
              <button type="button" onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
                className="flex w-full items-center gap-4 py-5 text-left">
                <span className={`flex-1 font-display text-[1.05rem] font-medium transition-colors ${isOpen ? "text-lampsoft" : "text-paper"}`}>
                  {item.q}
                </span>
                <Icon name="chevron" size={16}
                  className={`shrink-0 text-muted transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`} />
              </button>
            </h3>
            <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
              <div className="overflow-hidden">
                <p className="pb-5 pr-8 text-sm leading-relaxed text-muted">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
