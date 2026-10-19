"use client";
import { Component, useEffect, type ErrorInfo, type ReactNode } from "react";

/**
 * Reports browser crashes to /api/client-error.
 *
 * Everything here is written so that the reporter can never be the cause of a
 * second failure: every send is fire-and-forget, wrapped, and deduplicated
 * locally so a render loop cannot hammer the endpoint.
 */

const sent = new Set<string>();

type Report = { name?: string; message: string; stack?: string; kind: string };

function report(r: Report) {
  try {
    const key = `${r.kind}|${r.name ?? ""}|${r.message}`.slice(0, 300);
    if (sent.has(key)) return;        // once per page load is enough
    sent.add(key);

    const body = JSON.stringify({
      name: r.name,
      message: r.message,
      stack: r.stack,
      kind: r.kind,
      route: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });

    // sendBeacon survives the page being torn down, which is often exactly
    // when a crash happens. fetch with keepalive is the fallback.
    const sentViaBeacon = navigator.sendBeacon?.(
      "/api/client-error",
      new Blob([body], { type: "application/json" })
    );
    if (!sentViaBeacon) {
      void fetch("/api/client-error", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body, keepalive: true,
      }).catch(() => { /* reporting is best effort */ });
    }
  } catch { /* never let the reporter throw */ }
}

/** Window-level listeners: plain JS errors and rejected promises. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // A failed <script>/<img> load fires this with no Error attached and no
      // useful message; recording those would just add noise.
      if (!e.message) return;
      report({ name: e.error?.name, message: e.message, stack: e.error?.stack, kind: "window.onerror" });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report({
        name: r?.name ?? "UnhandledRejection",
        message: typeof r === "string" ? r : r?.message ?? "Unhandled promise rejection",
        stack: r?.stack,
        kind: "unhandledrejection",
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}

/**
 * Catches a React render crash, reports it, and shows something a person can
 * act on — a blank white page tells the user nothing and tells us nothing.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { crashed: boolean }
> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    report({
      name: error.name,
      message: error.message,
      stack: `${error.stack ?? ""}\n--- component stack ---${info.componentStack ?? ""}`,
      kind: this.props.label ? `react:${this.props.label}` : "react",
    });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h2 className="font-display text-xl text-paper">This part of the page stopped working</h2>
        <p className="mt-2 text-sm text-muted">
          The problem has been reported. Reloading usually fixes it, and your saved work is not affected.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => this.setState({ crashed: false })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
