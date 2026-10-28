"use client";
import { useEffect, useState } from "react";

/**
 * The consent bar, shown only where it is switched on.
 *
 * Consent Mode v2 needs an actual answer from the visitor: the defaults set
 * before any tag loads are "denied", and tags hold their data until something
 * updates that. Without a way to say yes, a site with consent required
 * collects nothing at all — which is correct, and useless.
 *
 * Declining is a real option here, not a smaller button that does the same
 * thing. The site works identically either way; the only difference is
 * whether an ad platform hears about it.
 */

const KEY = "em-consent";
type Choice = "granted" | "denied";

function update(choice: Choice) {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  // Pushed in the arguments shape gtag uses, so Google's own tags read it
  // whether or not gtag.js itself is on the page.
  function gtag(...args: unknown[]) { w.dataLayer!.push(args); }
  gtag("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
}

export function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* private window */ }

    if (saved === "granted" || saved === "denied") {
      // A choice already made still has to be re-stated on every page load:
      // the defaults are denied again each time the document is new.
      update(saved);
      return;
    }
    setShow(true);
  }, []);

  const choose = (choice: Choice) => {
    try { localStorage.setItem(KEY, choice); } catch { /* fine, ask again */ }
    update(choice);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div role="dialog" aria-label="Cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#0b1020]/95 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
      <p className="text-sm text-paper/85">
        We use cookies to measure how people find this site. Your notes, uploads and
        anything you type into the study tools are never shared with anyone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => choose("granted")}>
          Accept
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => choose("denied")}>
          Decline
        </button>
      </div>
    </div>
  );
}
