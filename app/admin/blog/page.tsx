"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../_components/Icon";
import { Card, Confirm, Empty, Loading, Page, Pill, useToast } from "../ui";

type Post = { id: string; slug: string; title: string; excerpt: string | null; status: string; tags: string[]; published_at: string | null; updated_at: string };

export default function BlogListPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<Post | null>(null);
  const { toast, toastNode } = useToast();
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/blog", { cache: "no-store" });
      const j = await r.json();
      setPosts(r.ok ? j.posts : []);
      if (!r.ok) toast(j.error || "Could not load posts.", true);
    } catch { setPosts([]); toast("Network problem.", true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setCreating(true);
    try {
      const r = await fetch("/api/admin/blog", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled post", content: "" }),
      });
      const j = await r.json();
      if (!r.ok) { toast(j.error || "Could not create the post.", true); return; }
      router.push(`/admin/blog/${j.post.id}`);
    } catch { toast("Network problem.", true); }
    finally { setCreating(false); }
  }

  async function remove(p: Post) {
    setDel(null);
    try {
      const r = await fetch(`/api/admin/blog/${p.id}`, { method: "DELETE" });
      if (!r.ok) { toast("Could not delete the post.", true); return; }
      setPosts((cur) => (cur ?? []).filter((x) => x.id !== p.id));
      toast("Post deleted.");
    } catch { toast("Network problem.", true); }
  }

  return (
    <Page title="Blog" sub="Write posts for the public site. Drafts stay hidden until you publish them."
      actions={<button type="button" className="btn btn-primary btn-sm" onClick={create} disabled={creating}>
        {creating ? <><span className="spinner" /> Creating…</> : <><Icon name="plus" size={14} /> New post</>}</button>}>
      {toastNode}
      {posts === null ? <Loading rows={4} /> : posts.length === 0 ? (
        <Card><Empty>No posts yet. Create your first one and it will appear at /blog once published.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/blog/${p.id}`} className="font-display text-base text-paper hover:text-lamp">{p.title}</Link>
                    <Pill tone={p.status === "published" ? "live" : "draft"}>{p.status === "published" ? "Live" : "Draft"}</Pill>
                  </div>
                  {p.excerpt && <p className="mt-1 line-clamp-1 text-sm text-muted">{p.excerpt}</p>}
                  <p className="mt-1 text-xs text-muted">
                    /blog/{p.slug} · edited {new Date(p.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.status === "published" && (
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm"><Icon name="eye" size={14} /> View</a>
                  )}
                  <Link href={`/admin/blog/${p.id}`} className="btn btn-ghost btn-sm"><Icon name="edit" size={14} /> Edit</Link>
                  <button type="button" className="btn btn-ghost btn-sm !text-red-200" onClick={() => setDel(p)} aria-label={`Delete ${p.title}`}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Confirm open={!!del} title="Delete this post?" message={`"${del?.title}" will be removed for good.`}
        confirmLabel="Delete" danger onCancel={() => setDel(null)} onConfirm={() => del && remove(del)} />
    </Page>
  );
}
