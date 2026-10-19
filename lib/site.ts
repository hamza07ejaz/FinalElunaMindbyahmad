/**
 * Where this site actually lives.
 *
 * Needed in more places than it looks: every social preview image, the canonical
 * link, the sitemap and the Stripe webhook endpoint all have to be absolute.
 * A relative URL in any of them fails silently — the share preview simply comes
 * back with no picture, and nothing in a log says why.
 */

const strip = (u: string) => u.trim().replace(/\/+$/, "");

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return strip(configured.startsWith("http") ? configured : `https://${configured}`);

  // Vercel sets this on every deployment, so previews get working previews too.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${strip(vercel)}`;

  return "http://localhost:3000";
}

/** The host on its own, for anywhere a bare domain reads better than a URL. */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "localhost:3000";
  }
}
