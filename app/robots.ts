import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";

/**
 * What crawlers may look at.
 *
 * The public marketing pages are the point of being indexed. Everything behind
 * a login is not just useless in a search result — a signed-out crawler sees the
 * login screen, so indexing it fills Google with duplicate "Sign in" pages that
 * outrank the real ones. `/diagnose` is excluded for a different reason: it
 * reports how the deployment is configured, and that belongs to the admin.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard/", "/admin/",
        "/api/",
        "/diagnose",
        "/auth/", "/reset", "/forgot",
        "/checkout/", "/success",
        "/suspended",
      ],
    }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
