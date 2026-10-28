import { guard } from "../../../lib/guard";

/**
 * Serves a stock photo through this site's own origin.
 *
 * Two problems solved by one hop. The content security policy allows the page
 * to connect to 'self' and little else, and the PowerPoint export fetches every
 * picture from the browser to embed it — so a photo on someone else's domain is
 * refused before it leaves. The other is CORS: whether a stock CDN happens to
 * send the right header is not something this app should depend on.
 *
 * The risk a proxy introduces is that it becomes an open one: hand it any URL
 * and it will fetch anything the server can reach, including addresses inside
 * the host's own network. So the allowed hosts are an explicit list, matched
 * exactly, and nothing else is fetched at all.
 */

export const maxDuration = 30;

/** Exact hostnames, never a suffix match: "images.pexels.com.evil.test" must not pass. */
const ALLOWED = new Set(["images.pexels.com", "images.unsplash.com"]);

export async function GET(req: Request) {
  // Signed in, and allowed to use the tool these pictures belong to.
  const g = await guard(req, "presentation");
  if (!g.ok) return g.res;

  const raw = new URL(req.url).searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("Bad image URL.", { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED.has(target.hostname)) {
    return new Response("That image host is not allowed.", { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      cache: "no-store",
      // The proxy gets its own deadline too: a stalled CDN must not keep a
      // serverless function alive until the platform's own limit.
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(12_000)]),
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("The image could not be fetched.", { status: 502 });
    }

    const type = upstream.headers.get("content-type") ?? "";
    // Whatever the host says it is, only serve it if it is a picture.
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type.split(";")[0].trim())) {
      return new Response("That is not an image.", { status: 415 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": type,
        // The same photo is fetched twice: once for the preview, once when the
        // deck is exported. A day of caching makes the second one free.
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("The image could not be fetched.", { status: 502 });
  }
}
