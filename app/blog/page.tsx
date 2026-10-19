import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "../../lib/supabase/admin";
import { getSettings } from "../../lib/settings";
import { SiteNav } from "../_components/landing/SiteNav";
import { Footer } from "../_components/landing/Footer";

export const revalidate = 300; // posts change rarely; re-check every 5 minutes

type Post = { slug: string; title: string; excerpt: string | null; cover_url: string | null; tags: string[] | null; published_at: string | null };

async function listPosts(): Promise<Post[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("blog_posts").select("slug,title,excerpt,cover_url,tags,published_at")
      .eq("status", "published").order("published_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Post[];
  } catch (err) {
    console.error("blog list unavailable:", (err as Error)?.message);
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getSettings();
  return { title: `Blog — ${branding.siteName}`, description: `Study tips and product news from ${branding.siteName}.` };
}

export default async function BlogIndex() {
  const { flags, branding } = await getSettings();
  if (!flags.blogEnabled) notFound();

  // This page is prerendered, so a database hiccup here would fail the whole
  // deploy. An empty list is a far better outcome than no site at all.
  const posts = await listPosts();

  return (
    <div className="relative">
      <SiteNav />
      <section className="relative overflow-hidden px-4 pb-16 pt-36 sm:px-6">
        <div className="lamp-glow left-1/2 top-0 h-72 w-[34rem] -translate-x-1/2 bg-violet-500/10" />
        <div className="relative mx-auto max-w-3xl">
          <h1 className="text-4xl sm:text-5xl">Study notes from the {branding.siteName} team</h1>
          <p className="lede mt-4">How to revise, what we are building, and the honest limits of studying with AI.</p>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {posts.length === 0 ? (
            <p className="rounded-2xl border border-white/10 py-16 text-center text-muted">
              Nothing published yet. Check back soon.
            </p>
          ) : (
            <ul className="divide-y divide-white/10">
              {posts.map((p) => (
                <li key={p.slug}>
                  <Link href={`/blog/${p.slug}`} className="group block py-7">
                    <div className="flex items-baseline gap-3">
                      <h2 className="font-display text-xl text-paper transition-colors group-hover:text-lamp">{p.title}</h2>
                    </div>
                    {p.excerpt && <p className="lede mt-2 text-sm">{p.excerpt}</p>}
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {p.published_at && <span>{new Date(p.published_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span>}
                      {(p.tags ?? []).map((t: string) => <span key={t} className="chip">{t}</span>)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}
