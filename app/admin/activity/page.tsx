"use client";
import { useEffect, useState } from "react";
import { Card, Empty, Loading, Page } from "../ui";

type Entry = { id: number; actor_email: string | null; action: string; target: string | null; detail: Record<string, unknown> | null; created_at: string };

const WORDS: Record<string, string> = {
  "user.update": "changed a user",
  "settings.rules": "changed the daily limits",
  "settings.pricing": "changed the pricing page",
  "settings.branding": "changed the branding",
  "settings.flags": "changed the site switches",
  "blog.create": "created a post",
  "blog.update": "edited a post",
  "blog.delete": "deleted a post",
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setEntries(j.entries ?? []))
      .catch(() => setEntries([]));
  }, []);

  return (
    <Page title="Activity log" sub="Every admin change, newest first. This log cannot be edited from the panel.">
      {entries === null ? <Loading rows={6} /> : entries.length === 0 ? (
        <Card><Empty>Nothing has been changed yet.</Empty></Card>
      ) : (
        <Card className="!p-0">
          <ul>
            {entries.map((e) => {
              const changes = Array.isArray(e.detail?.changes) ? (e.detail!.changes as string[]).join(", ") : "";
              return (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-white/5 px-5 py-3.5 text-sm last:border-0">
                  <span className="text-paper">{e.actor_email ?? "An admin"}</span>
                  <span className="text-muted">{WORDS[e.action] ?? e.action}</span>
                  {e.target && <span className="text-lamp">{e.target}</span>}
                  {changes && <span className="text-muted">({changes})</span>}
                  <span className="ml-auto text-xs text-muted">{new Date(e.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </Page>
  );
}
