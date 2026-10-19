import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "../_components/Markdown";
import { SiteNav } from "../_components/landing/SiteNav";
import { Footer } from "../_components/landing/Footer";
import { getPage, listLegalPages } from "../../lib/pages";
import { getSettings } from "../../lib/settings";

/**
 * The standalone pages: privacy, terms, cookies, refunds, and anything else an
 * admin adds. One route serves them all, with the body written in the admin
 * panel rather than in this file.
 *
 * This is the last route segment Next tries, so it only ever sees slugs that no
 * real page claimed.
 */

export const revalidate = 300;
export const dynamicParams = true;

type Ctx = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const pages = await listLegalPages();
  return pages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const [page, { branding }] = await Promise.all([getPage(slug), getSettings()]);
  if (!page) return { title: "Not found" };
  return {
    title: `${page.title} — ${branding.siteName}`,
    description: `${page.title} for ${branding.siteName}.`,
    alternates: { canonical: `/${slug}` },
  };
}

export default async function SitePage({ params }: Ctx) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  const updated = new Date(page.updated_at).toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="relative">
      <SiteNav />

      <main id="main" className="px-4 pb-24 pt-36 sm:px-6">
        <article className="mx-auto max-w-2xl">
          <header className="mb-10">
            <h1 className="text-balance text-4xl sm:text-5xl">{page.title}</h1>
            <p className="mt-4 text-sm text-muted">Last updated {updated}</p>
            <div className="seam-h mt-8" />
          </header>

          {/* Markdown already renders headings, lists, tables and blockquotes in
              the site's type scale, so the policy reads like the rest of the site. */}
          <div className="prose-page"><Markdown text={page.body} /></div>
        </article>
      </main>

      <Footer />
    </div>
  );
}
