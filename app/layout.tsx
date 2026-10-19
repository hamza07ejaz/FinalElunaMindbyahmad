import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ErrorReporter } from "./_components/ErrorCatcher";
import { getSettings } from "../lib/settings";
import { siteUrl } from "../lib/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Bricolage Grotesque for display: engineered letterforms with a little grit,
// which suits a mark built from circuitry. Inter carries everything else.
const display = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#05060e",
  width: "device-width",
  initialScale: 1,
};

/**
 * Everything a link needs to look like something when it is shared.
 *
 * This is generated rather than hardcoded for two reasons. The title and
 * description belong to the admin panel like the rest of the site's words, and
 * `metadataBase` has to be the real deployed address — without it Next emits
 * relative image URLs, which WhatsApp, Slack and LinkedIn cannot resolve, so
 * the preview comes back as a grey box with no picture at all.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { branding, analytics } = await getSettings();
  const base = siteUrl();
  const title = `${branding.siteName} — ${SHORT_PITCH}`;

  return {
    metadataBase: new URL(base),
    title: {
      default: title,
      // Every other page sets its own title and gets the name added for free.
      template: `%s · ${branding.siteName}`,
    },
    description: branding.tagline,
    applicationName: branding.siteName,
    keywords: ["AI tutor", "study notes", "flashcards", "exam revision", "lecture transcription", "study planner"],
    authors: [{ name: branding.siteName }],
    openGraph: {
      type: "website",
      siteName: branding.siteName,
      title,
      description: branding.tagline,
      url: base,
      locale: "en_US",
      // The image itself is drawn by app/opengraph-image.tsx. Next fills in the
      // dimensions and the absolute URL from metadataBase.
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: branding.tagline,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    /**
     * No canonical here on purpose.
     *
     * A canonical set on the root layout is inherited by every page that does
     * not override it, so each one ends up telling Google it is a duplicate of
     * the homepage — which is how a site gets indexed down to a single page.
     * Every public page now declares its own, and anything new that forgets to
     * will self-canonicalise, which is the right default.
     */
    verification: analytics.googleSiteVerification
      ? { google: analytics.googleSiteVerification }
      : undefined,
    formatDetection: { telephone: false },
  };
}

/** Said once here so the card, the tab and the search result agree. */
const SHORT_PITCH = "Smarter Learning";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read from the panel, not an env var, so the ID can be changed or removed
  // without a redeploy — and so a client can be handed the site without being
  // handed a build pipeline. getSettings caches for ten seconds and falls back
  // to defaults if the database is unreachable, so this cannot break the page.
  const { analytics } = await getSettings();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${display.variable} antialiased`}>
        <noscript>
          <style>{`.reveal{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {/*
          The first thing a keyboard reaches on every page. Without it, getting
          to the content means tabbing through the whole nav, every time — and
          on the dashboard that is the sidebar too. It is invisible until it has
          focus, which is the one moment it is useful.
        */}
        <a href="#main" className="skip-link">Skip to content</a>
        <ErrorReporter />
        {children}

        {/*
          Google Analytics, only when an ID is actually configured. afterInteractive
          keeps it out of the critical path: the page is usable before any of this
          is fetched, which matters more here than counting a visitor 200ms sooner.
          gaId is validated against the GA4 shape in settings, so interpolating it
          into both the URL and the inline call is safe.
        */}
        {analytics.gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${analytics.gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${analytics.gaId}');
            `}</Script>
          </>
        )}
      </body>
    </html>
  );
}
