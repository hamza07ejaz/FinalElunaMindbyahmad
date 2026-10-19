import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";
import { supabaseAdmin } from "../lib/supabase/admin";

/**
 * The sitemap.
 *
 * The fixed pages are listed by hand because they are few and their priorities
 * are a judgement, not a calculation. The blog posts and legal pages come from
 * the database, so publishing a post puts it in the sitemap without a deploy.
 *
 * A failed database read drops those two groups rather than failing the route:
 * a sitemap missing some pages is a small problem, and a sitemap returning 500
 * is one Google will keep retrying and eventually stop trusting.
 */
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  /**
   * Only pages that actually render something to a signed-out visitor.
   *
   * Deliberately missing: /flashcards, /grammar, /career and the rest. They look
   * like landing pages but every one is a redirect into the dashboard, so a
   * crawler following them arrives at a login screen. Listing a redirect in a
   * sitemap is worse than omitting it — Google reports it as an error and, if it
   * indexes anything, indexes the login page.
   *
   * Those slugs would be worth real landing pages one day. Until they are, they
   * do not belong here.
   */
  const fixed: Entry[] = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const [posts, pages] = await Promise.all([
    read(async () => {
      const { data } = await supabaseAdmin()
        .from("blog_posts").select("slug,updated_at,published_at")
        .eq("status", "published").order("published_at", { ascending: false }).limit(500);
      return (data ?? []).map((p): Entry => ({
        url: `${base}/blog/${p.slug}`,
        lastModified: new Date((p.updated_at as string) ?? (p.published_at as string) ?? now),
        changeFrequency: "yearly",
        priority: 0.6,
      }));
    }),
    read(async () => {
      const { data } = await supabaseAdmin().from("site_pages").select("slug,updated_at");
      return (data ?? []).map((p): Entry => ({
        url: `${base}/${p.slug}`,
        lastModified: new Date((p.updated_at as string) ?? now),
        changeFrequency: "yearly",
        priority: 0.3,
      }));
    }),
  ]);

  // A page could be listed twice if a legal page shares a slug with a fixed one.
  const seen = new Set<string>();
  return [...fixed, ...posts, ...pages].filter((e) => !seen.has(e.url) && seen.add(e.url));
}

async function read(fn: () => Promise<Entry[]>): Promise<Entry[]> {
  try {
    return await fn();
  } catch (err) {
    console.error("sitemap section unavailable:", (err as Error)?.message);
    return [];
  }
}
