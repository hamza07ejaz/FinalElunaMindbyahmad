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

/** Supabase is a different origin, so the browser has to be allowed to reach it. */
const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const supabaseWs = supabase.replace(/^https:/, "wss:");

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
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
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
    supabase, supabaseWs,
    "https://api.stripe.com",
    // Where gtag.js sends what it collects. The regional endpoints matter:
    // Google routes a visitor in Europe to region1.analytics.google.com rather
    // than the main host, so a policy listing only the obvious domain works in
    // testing and then silently drops hits from half the world.
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
  ].filter(Boolean).join(" "),
  // Nothing is embedded, and nothing embeds this. Stripe checkout and the
  // billing portal are full redirects, not iframes.
  "frame-src 'none'",
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
