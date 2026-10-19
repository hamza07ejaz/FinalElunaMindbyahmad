"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Icon } from "../../../_components/Icon";
import { Markdown } from "../../../_components/Markdown";
import { Card, Field, Loading, Page, Pill, useToast } from "../../ui";

type Post = {
  id: string; slug: string; title: string; excerpt: string | null; content: string;
  cover_url: string | null; tags: string[]; status: string; published_at: string | null;
};

export default function BlogEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [p, setP] = useState<Post | null>(null);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast, toastNode } = useToast();

  useEffect(() => {
    fetch(`/api/admin/blog/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.post) { setP(j.post); setTags((j.post.tags ?? []).join(", ")); } else toast(j.error || "Post not found.", true); })
      .catch(() => toast("Could not load the post.", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // warn before losing unsaved work
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const edit = (patch: Partial<Post>) => { setP((cur) => (cur ? { ...cur, ...patch } : cur)); setDirty(true); };

  async function save(status?: "draft" | "published") {
    if (!p) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/blog/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: p.title, excerpt: p.excerpt ?? "", content: p.content,
          coverUrl: p.cover_url ?? "", tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          ...(status ? { status } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast(j.error || "Could not save.", true); return; }
      if (status) edit({ status });
      setDirty(false);
      toast(status === "published" ? "Published. It is live on /blog now." : status === "draft" ? "Moved back to draft." : "Saved.");
    } catch { toast("Network problem. Nothing was saved.", true); }
    finally { setSaving(false); }
  }

  if (!p) return <Page title="Post"><Loading rows={5} /></Page>;

  return (
    <Page
      title={p.title || "Untitled post"}
      sub={`/blog/${p.slug}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/blog" className="btn btn-ghost btn-sm">← All posts</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview((v) => !v)}>
            <Icon name={preview ? "edit" : "eye"} size={14} /> {preview ? "Edit" : "Preview"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => save()}>
            {saving ? <span className="spinner" /> : <Icon name="save" size={14} />} Save
          </button>
          {p.status === "published" ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => save("draft")}>Unpublish</button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => save("published")}>Publish</button>
          )}
        </div>
      }
    >
      {toastNode}
      <div className="mb-4 flex items-center gap-2">
        <Pill tone={p.status === "published" ? "live" : "draft"}>{p.status === "published" ? "Live" : "Draft"}</Pill>
        {dirty && <span className="text-xs text-lamp">Unsaved changes</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card>
          {preview ? (
            <article>
              <h1 className="font-display text-3xl text-paper">{p.title}</h1>
              {p.excerpt && <p className="lede mt-2">{p.excerpt}</p>}
              <div className="mt-6"><Markdown text={p.content || "_Nothing written yet._"} /></div>
            </article>
          ) : (
            <div className="space-y-4">
              <Field label="Title"><input className="input !text-lg" value={p.title} onChange={(e) => edit({ title: e.target.value })} /></Field>
              <Field label="Excerpt" hint="shown on the blog list"><textarea className="input !min-h-0" rows={2} value={p.excerpt ?? ""} onChange={(e) => edit({ excerpt: e.target.value })} /></Field>
              <Field label="Body" hint="Markdown: # heading, **bold**, - list">
                <textarea className="input font-mono !text-[0.85rem]" rows={20} value={p.content} onChange={(e) => edit({ content: e.target.value })}
                  placeholder={"## How to study for finals\n\nStart with **active recall**:\n\n- Close the book\n- Write what you remember"} />
              </Field>
            </div>
          )}
        </Card>

        <aside className="space-y-5">
          <Card>
            <h2 className="mb-3 font-display text-base text-paper">Post settings</h2>
            <div className="space-y-4">
              <Field label="Cover image URL"><input className="input" value={p.cover_url ?? ""} onChange={(e) => edit({ cover_url: e.target.value })} placeholder="https://…" /></Field>
              <Field label="Tags" hint="comma separated"><input className="input" value={tags} onChange={(e) => { setTags(e.target.value); setDirty(true); }} placeholder="study tips, exams" /></Field>
            </div>
            {p.published_at && <p className="mt-4 text-xs text-muted">First published {new Date(p.published_at).toLocaleDateString()}</p>}
          </Card>
          {p.cover_url && (
            <Card className="!p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.cover_url} alt="Cover preview" className="w-full rounded-xl" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </Card>
          )}
        </aside>
      </div>
    </Page>
  );
}
