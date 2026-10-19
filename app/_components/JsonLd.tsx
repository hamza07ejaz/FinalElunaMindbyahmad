/**
 * Structured data.
 *
 * Google reads the page like anyone else and guesses what it is looking at.
 * These blocks stop it guessing: they say in so many words that this is an
 * organisation, that this page is a FAQ, that this one is an article written on
 * a particular date. That is what a rich result is built from — the questions
 * that unfold under a search listing, the site name rather than the bare domain,
 * the date next to a blog post.
 *
 * A `application/ld+json` block is data, not code: the browser never executes
 * it, so it costs nothing at runtime and nothing in the content security policy.
 *
 * The one rule worth remembering when editing these: every claim here must be
 * visible on the page itself. Marking up a question that is not on the page is
 * the kind of thing Google issues manual penalties for.
 */

type Json = Record<string, unknown>;

export function JsonLd({ data }: { data: Json | Json[] }) {
  const payload = Array.isArray(data)
    ? { "@context": "https://schema.org", "@graph": data }
    : { "@context": "https://schema.org", ...data };

  return (
    <script
      type="application/ld+json"
      // The content is built from our own settings and database rows, never
      // from a visitor. JSON.stringify escapes quotes; the `<` replacement
      // closes the one hole it leaves, which is a literal </script> inside a
      // string value ending the block early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(payload).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** The site itself: who runs it, what it is called, where its logo lives. */
export function organisation(base: string, name: string, tagline: string, logo?: string): Json[] {
  return [
    {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name,
      url: base,
      description: tagline,
      logo: logo || `${base}/icon-512.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name,
      url: base,
      description: tagline,
      publisher: { "@id": `${base}/#organization` },
      inLanguage: "en",
    },
  ];
}

/**
 * The homepage FAQ, marked up so the questions can appear under the search
 * result. Built from the same content the page renders, so the two cannot
 * drift apart.
 */
export function faqPage(items: { q: string; a: string }[]): Json | null {
  if (items.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** A blog post, with the dates and author Google shows beside a result. */
export function blogPosting(
  base: string,
  siteName: string,
  post: { slug: string; title: string; excerpt?: string | null; cover_url?: string | null; published_at?: string | null; updated_at?: string | null },
): Json[] {
  const url = `${base}/blog/${post.slug}`;
  return [
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      headline: post.title.slice(0, 110),   // Google ignores a longer headline
      description: post.excerpt || undefined,
      image: post.cover_url || `${base}/opengraph-image`,
      datePublished: post.published_at || undefined,
      dateModified: post.updated_at || post.published_at || undefined,
      author: { "@type": "Organization", name: siteName, url: base },
      publisher: { "@id": `${base}/#organization` },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      inLanguage: "en",
    },
    {
      // The trail Google prints above a result instead of a raw URL.
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: siteName, item: base },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${base}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
}
