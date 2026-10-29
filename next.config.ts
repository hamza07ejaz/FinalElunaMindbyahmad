import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * There were none. That meant the site could be put in an iframe on any domain
 * — a login form inside someone else's page, with their buttons over yours — and
 * a single injected script had nothing stopping it from sending what it read to
 * wherever it liked. Headers are the cheapest defence there is: no code changes,
 * no runtime cost, and they apply to every route at once.
 *
 * The content security policy below is deliberately not the strictest one
 * possible. A nonce-based policy needs middleware on every request, and a policy
 * that breaks the app is worse than no policy, because the first instinct when a
 * page breaks is to delete the whole thing. This is the strict-as-it-can-be
 * version that still lets Next.js hydrate and Tailwind inline its styles, and it
 * was verified in a browser with the console watched, not just written.
 */

/**
 * Supabase is a different origin, so the browser has to be allowed to reach it.
 *
 * This is read at BUILD time, which is the trap. If the variable is missing or
 * wrong in the build environment, connect-src ends up without Supabase in it and
 * the browser silently blocks every auth and database call. What the user sees
 * is "Failed to fetch" on the login screen — a message that points nowhere near
 * a security header, and that survives fixing the variable until the next build.
 *
 * So: use the exact origin when it is there, and fall back to the Supabase
 * wildcard when it is not. A slightly wider policy on a misconfigured deployment
 * is a far better failure than an application that cannot talk to its database.
 */
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const supabaseOrigins = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(supabaseUrl)
  ? [supabaseUrl, supabaseUrl.replace(/^https:/, "wss:")]
  : ["https://*.supabase.co", "wss://*.supabase.co", "https://*.supabase.in", "wss://*.supabase.in"];

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is what Next's hydration bootstrap needs. 'unsafe-eval' is
  // deliberately absent: nothing here evaluates strings as code.
  //
  // googletagmanager is listed whether or not analytics is switched on, because
  // the measurement ID lives in the admin panel and this header is built once at
  // build time. The widening is small: 'unsafe-inline' is already here, so an
  // attacker who could inject a tag could already run code; this only adds one
  // more well-known origin they could load it from.
  [
    "script-src 'self' 'unsafe-inline'",
    // A tag manager does not load tags from its own domain. Google Ads
    // conversions come from googleadservices, remarketing from doubleclick,
    // the Meta pixel from connect.facebook.net — and a blocked tag fails
    // silently, so the first anyone knows is a campaign reporting no
    // conversions a fortnight later.
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://www.googleadservices.com",
    "https://googleads.g.doubleclick.net",
    "https://www.googletagservices.com",
    "https://connect.facebook.net",
    // Tag Assistant, so the agency's preview mode works against the live site.
    "https://tagassistant.google.com",
  ].join(" "),
  // Tailwind and the components set styles inline; there is no way around this one.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // An admin can point the logo at any URL, so images come from anywhere over
  // https. blob: and data: are for previews of a file before it is uploaded.
  "img-src 'self' data: blob: https:",
  // Audio and video the admin configures for the hero.
  "media-src 'self' blob: https:",
  [
    "connect-src 'self'",
    ...supabaseOrigins,
    "https://api.stripe.com",
    // Where gtag.js sends what it collects. The regional endpoints matter:
    // Google routes a visitor in Europe to region1.analytics.google.com rather
    // than the main host, so a policy listing only the obvious domain works in
    // testing and then silently drops hits from half the world.
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    // Where conversions are actually reported to.
    "https://www.googleadservices.com",
    "https://googleads.g.doubleclick.net",
    "https://*.doubleclick.net",
    "https://www.google.com",
    "https://connect.facebook.net",
    "https://www.facebook.com",
    "https://graph.facebook.com",
    "https://tagassistant.google.com",
  ].filter(Boolean).join(" "),
  // Nothing of ours is embedded, and nothing embeds this: Stripe checkout and
  // the billing portal are full redirects. The exceptions are the invisible
  // frames the ad platforms use for conversion linking and the tag manager's
  // own preview, which do not work at all under 'none'.
  [
    "frame-src",
    "https://www.googletagmanager.com",
    "https://tagassistant.google.com",
    "https://googleads.g.doubleclick.net",
    "https://*.doubleclick.net",
    "https://www.facebook.com",
    // The demo video above the three steps. nocookie is the host the embed
    // builder produces, so this is the one that has to be listed.
    "https://www.youtube-nocookie.com",
    "https://www.youtube.com",
    "https://player.vimeo.com",
  ].join(" "),
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  // A form that posts anywhere else is either a bug or an attack.
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // frame-ancestors covers this for modern browsers; kept for the older ones.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser deciding a text file is really a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full URL within the site, only the origin when leaving it, and
  // nothing at all when downgrading to http.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app asks for none of these. Saying so stops an embedded script asking.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // Two years, including subdomains. Only ever sent over https, so it cannot
  // lock anyone out of a local http build.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  /**
   * Keep the PDF stack out of the bundler.
   *
   * pdf-parse runs pdfjs, which needs DOMMatrix — a browser API that Node does
   * not have. It borrows one from @napi-rs/canvas, which is a native .node
   * binary loaded by a runtime require.
   *
   * Bundling breaks exactly that: the binary is not a module the tracer can
   * follow, so on a deployed build the polyfill silently fails to load and the
   * first PDF anyone uploads dies with "DOMMatrix is not defined" — a message
   * with no PDF in it, on a path that works perfectly on a developer's laptop.
   * Listing them here leaves them as real packages on disk, binary included.
   */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],

  // The app's own 404 and error pages are the ones people should see.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // The icons, the manifest and the share image never change for a given
        // deploy, and Next fingerprints their URLs, so they can be cached hard.
        source: "/:path(icon-192.png|icon-512.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // An API response must never be cached by a CDN: every one of them is
        // specific to the signed-in person asking.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
