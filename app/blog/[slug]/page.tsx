import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { getSettings } from "../../../lib/settings";
import { Markdown } from "../../_components/Markdown";
import { SiteNav } from "../../_components/landing/SiteNav";
import { Footer } from "../../_components/landing/Footer";

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

async function getPost(slug: string) {
  const { data } = await supabaseAdmin()
    .from("blog_posts").select("slug,title,excerpt,content,cover_url,tags,author_name,published_at")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: { title: post.title, description: post.excerpt ?? undefined, images: post.cover_url ? [post.cover_url] : undefined },
  };
}

export default async function BlogPost({ params }: Props) {
  const { flags } = await getSettings();
  if (!flags.blogEnabled) notFound();

  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <div className="relative">
      <SiteNav />
      <article className="px-4 pb-20 pt-36 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <Link href="/blog" className="text-sm text-muted transition-colors hover:text-paper">← All posts</Link>
          <h1 className="mt-5 text-4xl leading-tight">{post.title}</h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {post.author_name && <span>{post.author_name}</span>}
            {post.published_at && <span>{new Date(post.published_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>}
          </p>
          {post.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_url} alt="" className="mt-8 w-full rounded-2xl border border-white/10" />
          )}
          <div className="mt-10"><Markdown text={post.content} /></div>
          {(post.tags ?? []).length > 0 && (
            <p className="mt-10 flex flex-wrap gap-2">{post.tags.map((t: string) => <span key={t} className="chip">{t}</span>)}</p>
          )}
        </div>
      </article>

      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-violet-400/25 p-8 text-center"
          style={{ background: "radial-gradient(120% 120% at 50% 0%, rgba(139,108,255,.14), rgba(11,16,32,0) 70%)" }}>
          <h2 className="text-2xl">Try the tutor on your own subject</h2>
          <p className="lede mx-auto mt-2 text-sm">Free to start, no card needed.</p>
          <Link href="/login?mode=signup&next=/dashboard" className="btn btn-primary mt-5">Start free</Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}
