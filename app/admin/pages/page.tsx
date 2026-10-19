"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../_components/Icon";
import { Markdown } from "../../_components/Markdown";
import { Card, Confirm, Empty, Field, Loading, Page, Pill, useToast } from "../ui";

type SitePage = {
  slug: string; title: string; body: string; updated_at: string;
  published: boolean; required: boolean; sort: number;
};

export default function PagesAdmin() {
  const { toast, toastNode } = useToast();
  const [pages, setPages] = useState<SitePage[] | null>(null);
  const [starters, setStarters] = useState<Record<string, string>>({});
  const [setupNeeded, setSetupNeeded] = useState<string | null>(null);

  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [ask, setAsk] = useState<SitePage | null>(null);

  const load = useCallback(async () => {
    setSetupNeeded(null);
    try {
      const r = await fetch("/api/admin/pages", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.setupNeeded) setSetupNeeded(j.error);
        else toast(j.error || "Could not load the pages.", true);
        setPages([]); return;
      }
      setPages(j.pages ?? []); setStarters(j.starters ?? {});
    } catch { setPages([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  function open(p: SitePage) {
    setSlug(p.slug); setTitle(p.title);
    // An empty body means the page is still showing the starter, so that is
    // what loads into the editor — otherwise it looks like there is nothing there.
    setBodyText(p.body?.trim() ? p.body : starters[p.slug] ?? "");
    setPreview(false);
  }

  async function save() {
    if (!slug) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/pages", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, title, body: bodyText }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "That did not save.", true); return; }
      toast("Page saved."); await load();
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setBusy(false); }
  }

  async function toggle(p: SitePage) {
    const r = await fetch("/api/admin/pages", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: p.slug, published: !p.published }),
    });
    if (r.ok) { toast(p.published ? "Page hidden." : "Page is live."); await load(); }
    else toast("Could not change that.", true);
  }

  async function create() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/pages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: "" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "Could not create it.", true); return; }
      setNewTitle(""); setCreating(false); await load(); toast("Page created.");
    } finally { setBusy(false); }
  }

  async function remove(p: SitePage) {
    const r = await fetch(`/api/admin/pages?slug=${encodeURIComponent(p.slug)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { toast("Page deleted."); if (slug === p.slug) setSlug(null); await load(); }
    else toast(j.error || "Could not delete it.", true);
    setAsk(null);
  }

  if (setupNeeded)
    return (
      <Page title="Pages">
        {toastNode}
        <Card><div className="mx-auto max-w-lg py-10 text-center">
          <h2 className="font-display text-lg text-paper">One migration to run first</h2>
          <p className="mt-2 text-sm text-muted">{setupNeeded}</p>
          <code className="mt-4 inline-block rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-paper/85">supabase/009_site_content.sql</code>
          <div className="mt-6"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
            <Icon name="refresh" size={14} /> Check again</button></div>
        </div></Card>
      </Page>
    );

  const editing = pages?.find((p) => p.slug === slug) ?? null;
  const unfinished = bodyText.trimStart().startsWith(">");

  return (
    <Page
      title="Pages"
      sub="Privacy, terms and anything else that is not part of the app. Written in markdown."
      actions={
        <div className="flex gap-2">
          {editing && (
            <a href={`/${editing.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              <Icon name="eye" size={14} /> View
            </a>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating((v) => !v)}>
            <Icon name="plus" size={14} /> New page
          </button>
        </div>
      }
    >
      {toastNode}

      {creating && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Field label="Page title" hint="the web address comes from this">
                <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Acceptable Use" />
              </Field>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !newTitle.trim()} onClick={create}>
              Create
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        {/* the list */}
        <aside>
          {pages === null ? <Loading rows={4} /> : pages.length === 0 ? (
            <Card><Empty>No pages yet.</Empty></Card>
          ) : (
            <ul className="space-y-1.5">
              {pages.map((p) => (
                <li key={p.slug}>
                  <button type="button" onClick={() => open(p)}
                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                      slug === p.slug ? "border-violet-400/50 bg-white/[0.07]" : "border-white/[0.07] hover:bg-white/[0.04]"
                    }`}>
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-paper">{p.title}</span>
                      {!p.published && <Pill tone="draft">Hidden</Pill>}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <code>/{p.slug}</code>
                      {!p.body?.trim() && <span className="text-lampsoft">needs writing</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* the editor */}
        <div>
          {!editing ? (
            <Card><Empty>Pick a page to edit it.</Empty></Card>
          ) : (
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <input className="input !py-2 font-display !text-base" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview((v) => !v)}>
                    <Icon name={preview ? "edit" : "eye"} size={13} /> {preview ? "Edit" : "Preview"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(editing)}>
                    <Icon name={editing.published ? "ban" : "check"} size={13} /> {editing.published ? "Hide" : "Publish"}
                  </button>
                  {!editing.required && (
                    <button type="button" aria-label="Delete page" onClick={() => setAsk(editing)}
                      className="rounded-lg p-2 text-muted transition hover:bg-red-500/20 hover:text-red-300">
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </div>

              {unfinished && (
                <p className="mb-4 rounded-xl border border-violet-400/30 bg-violet-500/10 p-3 text-xs text-lampsoft">
                  This page is still the starter text. Everything in square brackets needs your own details, and the
                  warning block at the top should be deleted once you have filled it in. Have a lawyer read it before
                  you take payments.
                </p>
              )}

              {preview ? (
                <div className="prose-page rounded-2xl border border-white/[0.07] p-5">
                  <Markdown text={bodyText} />
                </div>
              ) : (
                <textarea
                  className="input !min-h-[32rem] font-mono !text-[0.82rem] !leading-relaxed"
                  value={bodyText} onChange={(e) => setBodyText(e.target.value)}
                  placeholder="## A heading&#10;&#10;Your text. Markdown works: **bold**, lists, > callouts."
                />
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
                  {busy ? <><span className="spinner" /> Saving…</> : <><Icon name="save" size={14} /> Save page</>}
                </button>
                {editing.required && (
                  <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => setBodyText(starters[editing.slug] ?? "")}>
                    <Icon name="refresh" size={13} /> Reset to the starter
                  </button>
                )}
                <span className="text-xs text-muted">
                  Last saved {new Date(editing.updated_at).toLocaleString()}
                </span>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Confirm
        open={!!ask}
        title="Delete this page?"
        message={`"${ask?.title ?? ""}" and everything written in it. Anyone with the link will get a not-found page.`}
        confirmLabel="Delete" danger
        onCancel={() => setAsk(null)}
        onConfirm={() => ask && remove(ask)}
      />
    </Page>
  );
}
