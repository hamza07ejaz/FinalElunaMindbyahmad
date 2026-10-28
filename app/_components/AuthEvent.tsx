"use client";
import { useEffect } from "react";
import { analytics } from "../../lib/analytics";

/**
 * Reports a Google sign-in once, then removes the evidence.
 *
 * The callback route decides whether the visit was a registration or a return
 * and says so in a query parameter. This reads it, fires the matching event,
 * and strips the parameter from the URL with replaceState — so a refresh, a
 * bookmark, or a shared link cannot fire it a second time.
 *
 * Password sign-ups and logins are reported from the form itself, where the
 * browser already knows which one happened.
 */
export function AuthEvent() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const kind = url.searchParams.get("auth");
    if (kind !== "signup" && kind !== "login") return;

    if (kind === "signup") analytics.signUp("google");
    else analytics.login("google");

    url.searchParams.delete("auth");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, []);

  return null;
}
