import type { MetadataRoute } from "next";
import { getSettings } from "../lib/settings";

/**
 * The web app manifest — what a phone uses when someone adds the site to their
 * home screen, and what Chrome reads for the install prompt.
 *
 * The name comes from the admin panel rather than being hardcoded, so renaming
 * the site in Branding renames the home-screen icon too. `getSettings()` falls
 * back to its defaults when the database is unreachable, so this never fails
 * the request.
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { branding } = await getSettings();

  return {
    name: branding.siteName,
    short_name: branding.siteName.split(/\s+/)[0] || branding.siteName,
    description: branding.tagline,
    start_url: "/dashboard",
    // Opening to the dashboard rather than the marketing page: someone who has
    // installed the app has already decided, and does not want the pitch again.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#05060e",
    theme_color: "#05060e",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // The mark already sits on its own dark tile with room around it, so it
      // survives Android's circular and squircle masks without a second file.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
