import { supabaseAdmin } from "./supabase/admin";
import { clientFor, eachProvider, explain } from "./ai";

/**
 * Pictures for presentation slides.
 *
 * Two sources, and the difference between them is the whole design:
 *
 * A stock photo is free, instant, and — the part that matters for a deck a
 * student will hand in — licensed for the use. Pexels' licence permits
 * commercial use and modification, so a slide built here is not a copyright
 * problem waiting to be discovered by somebody's university.
 *
 * A generated picture costs real money every time and takes seconds rather than
 * milliseconds, so it is off until an owner turns it on, and capped even then.
 * It is also, for anything factual, the less trustworthy of the two: a model
 * asked for a diagram of a cell will cheerfully produce one with invented
 * organelles and misspelt labels. That is why the prompt below asks for a
 * photograph, never a chart, a diagram or anything with writing in it.
 *
 * What is never here: a general web image search. Those results belong to the
 * people who made them.
 */

export type SlideImage = {
  url: string;
  alt: string;
  credit?: string;
  source: "stock" | "ai";
};

export type ImageConfig = {
  stockKey: string;
  stockProvider: string;
  aiImagesEnabled: boolean;
  maxImagesPerDeck: number;
  status: string;
  lastError: string | null;
  /**
   * Why there are no pictures, when there are none.
   *
   * This exists because the first version of this file swallowed a missing
   * table and returned an empty config, and the tool then quietly produced
   * decks with no images and said nothing at all. Silence is the wrong answer
   * to "I set this up and it does not work": somebody has to be told that the
   * migration never ran.
   */
  problem: string | null;
};

const EMPTY: ImageConfig = {
  stockKey: "", stockProvider: "pexels",
  aiImagesEnabled: false, maxImagesPerDeck: 4,
  status: "untested", lastError: null, problem: null,
};

const CACHE_MS = 10_000;
let cache: { at: number; value: ImageConfig } | null = null;

export function clearImageCache() { cache = null; }

/** Server-only. The key never goes through getSettings, so it cannot reach a page. */
export async function imageConfig(force = false): Promise<ImageConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  let value = EMPTY;
  try {
    const { data, error } = await supabaseAdmin()
      .from("image_config")
      .select("stock_key,stock_provider,ai_images_enabled,max_images_per_deck,status,last_error")
      .eq("id", 1).maybeSingle();

    if (error) throw new Error(error.message);

    if (!data) {
      value = { ...EMPTY, problem: "The image settings row is missing. Run supabase/013_slide_images.sql." };
    } else {
      const stockKey = (data.stock_key as string) || "";
      const aiEnabled = !!data.ai_images_enabled;
      value = {
        stockKey,
        stockProvider: (data.stock_provider as string) || "pexels",
        aiImagesEnabled: aiEnabled,
        maxImagesPerDeck: Math.min(12, Math.max(0, Number(data.max_images_per_deck) || 0)),
        status: (data.status as string) || "untested",
        lastError: (data.last_error as string) ?? null,
        problem: !stockKey && !aiEnabled
          ? "No stock photo key is saved and AI pictures are switched off. Add a Pexels key in Admin → AI keys."
          : null,
      };
    }
  } catch (err) {
    // Still never throws — a presentation tool must not fall over because a
    // photo service is unreachable — but the reason is carried out now instead
    // of being dropped on the floor.
    const m = (err as Error)?.message ?? "";
    value = {
      ...EMPTY,
      problem: /relation .* does not exist|could not find the table|schema cache/i.test(m)
        ? "The image_config table does not exist. Run supabase/013_slide_images.sql in the Supabase SQL editor."
        : `Image settings could not be read: ${m.slice(0, 160)}`,
    };
  }

  cache = { at: Date.now(), value };
  return value;
}

export function maskKey(k: string): string {
  if (!k) return "";
  return k.length <= 8 ? "••••" : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Stock photos                                                        */
/* ------------------------------------------------------------------ */

const PEXELS = "https://api.pexels.com/v1/search";

/** A photo is a nicety; it does not get to hold a request open. */
const STOCK_TIMEOUT_MS = 8_000;

type PexelsPhoto = {
  alt?: string;
  photographer?: string;
  src?: Record<string, string>;
};

/**
 * One landscape photo for a query, or null.
 *
 * Null is a perfectly good answer: a slide whose picture could not be found
 * falls back to a bullets layout, which is what it would have been anyway.
 */
export async function searchStock(
  query: string,
  key: string,
  signal?: AbortSignal,
): Promise<SlideImage | null> {
  const q = query.trim();
  if (!q || !key) return null;

  const url = `${PEXELS}?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape&size=medium`;

  // A deadline of its own, not just the request's. If the photo service stops
  // answering, the deck should arrive without pictures rather than the whole
  // request sitting open until the platform kills it.
  const res = await fetch(url, {
    headers: { Authorization: key },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(STOCK_TIMEOUT_MS)]) : AbortSignal.timeout(STOCK_TIMEOUT_MS),
    cache: "no-store",
  });

  if (res.status === 401) throw new Error("The stock photo key was rejected. Check it in Admin → Images.");
  if (res.status === 429) throw new Error("The stock photo account is out of requests for now. It resets hourly.");
  if (!res.ok) throw new Error(`Stock photo search failed (${res.status}).`);

  const json = (await res.json()) as { photos?: PexelsPhoto[] };
  const photo = (json.photos ?? [])[0];
  // "large" is about 1.2k wide: enough for a slide, small enough that a deck of
  // them does not take a minute to download.
  const src = photo?.src?.large || photo?.src?.landscape || photo?.src?.medium;
  if (!src) return null;

  return {
    url: src,
    alt: (photo?.alt || q).slice(0, 200),
    credit: photo?.photographer ? `Photo: ${photo.photographer} / Pexels` : "Pexels",
    source: "stock",
  };
}

/* ------------------------------------------------------------------ */
/* Generated pictures                                                  */
/* ------------------------------------------------------------------ */

/**
 * Ask the AI provider for a picture.
 *
 * Returns a data URI rather than a link, because there is nowhere to host the
 * result and a data URI drops straight into both the preview and the export.
 *
 * Not every provider offers this. Gemini through the OpenAI-compatible endpoint
 * has no /images/generations, so this throws a sentence an admin can act on
 * rather than a stack trace.
 */
export async function generateImage(query: string, signal?: AbortSignal): Promise<SlideImage | null> {
  const q = query.trim();
  if (!q) return null;

  const providers = await eachProvider();
  if (!providers.length) throw new Error("No AI provider is configured.");

  let lastError: unknown = null;
  for (const p of providers) {
    try {
      const client = clientFor(p);
      const out = await client.images.generate({
        // Providers do not advertise an image model the way they do a chat one,
        // so this is a default with an escape hatch rather than a per-provider
        // setting nobody would know how to fill in.
        model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1",
        prompt:
          `A clean, realistic photograph of ${q}. ` +
          // Text inside a generated image is almost always misspelt, and a
          // misspelt label on a study slide is worse than no picture at all.
          `No text, no words, no letters, no numbers, no charts, no diagrams, no watermarks, no logos. ` +
          `Natural lighting, documentary style, plenty of empty space, nothing in the centre.`,
        size: "1536x1024",
        n: 1,
      }, { signal });

      const first = out.data?.[0];
      const url = first?.b64_json ? `data:image/png;base64,${first.b64_json}` : first?.url;
      if (!url) throw new Error("The provider returned no image.");

      return { url, alt: q, credit: "Generated", source: "ai" };
    } catch (err) {
      lastError = err;
      if (isUnsupported(err)) continue;   // try the next provider
      throw err;
    }
  }

  throw new Error(
    `No configured AI provider can generate images (${explain(lastError)}). ` +
    `Gemini's OpenAI-compatible endpoint cannot; an OpenAI key can.`,
  );
}

/** A provider that simply does not offer this, as opposed to one that failed. */
function isUnsupported(err: unknown): boolean {
  const m = (err as { message?: string })?.message ?? "";
  const status = (err as { status?: number })?.status;
  return status === 404 || status === 400 || /not found|unsupported|unknown|no such|does not support/i.test(m);
}
