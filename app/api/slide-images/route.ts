import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";
import { readJson } from "../../../lib/ai";
import { imageConfig, generateImage, searchStock, type SlideImage } from "../../../lib/images";
import { captureRouteError } from "../../../lib/errors";

/**
 * Pictures for a deck that already exists.
 *
 * Deliberately a second request rather than part of generating the slides. The
 * deck is the thing the student is waiting for; making them watch a spinner for
 * another ten seconds while photographs are fetched would be trading the part
 * that matters for the part that decorates. The slides arrive, then the images
 * drop in behind them.
 *
 * It also means a failure here is survivable. Every error path returns the
 * slides unchanged rather than an error: a deck without photographs is a deck,
 * and a tool that refuses to finish because a photo service is down is not.
 */

export const maxDuration = 60;

type Ask = { index: number; query: string };

export async function POST(req: Request) {
  // Same gate as the presentation tool itself, so this cannot be used as a free
  // image search by anyone who finds the URL.
  const g = await guard(req, "presentation");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const wantAi = body?.mode === "ai";
  const cfg = await imageConfig();

  const asks: Ask[] = Array.isArray(body?.images)
    ? (body.images as unknown[])
        .map((a) => {
          const o = a as Record<string, unknown>;
          return { index: Number(o?.index), query: String(o?.query ?? "").trim().slice(0, 60) };
        })
        .filter((a) => Number.isInteger(a.index) && a.index >= 0 && a.index < 40 && a.query.length > 1)
        .slice(0, cfg.maxImagesPerDeck)
    : [];

  if (!asks.length) return NextResponse.json({ images: [] });

  const useAi = wantAi && cfg.aiImagesEnabled;
  if (!useAi && !cfg.stockKey) {
    return NextResponse.json({ images: [], note: "No stock photo key is set up." });
  }

  try {
    const results = await Promise.all(
      asks.map(async (a): Promise<{ index: number; image: SlideImage } | null> => {
        try {
          const image = useAi
            ? await generateImage(a.query, req.signal)
            : await searchStock(a.query, cfg.stockKey, req.signal);
          return image ? { index: a.index, image } : null;
        } catch (err) {
          // One query failing — a word with no photographs behind it — must not
          // cost the deck its other pictures.
          console.error("slide image failed:", a.query, (err as Error)?.message);
          return null;
        }
      }),
    );

    // Hand back a URL on this origin, not the stock CDN's. The preview and the
    // PowerPoint export both fetch these, and both are bound by a policy that
    // allows 'self'. A generated picture is already a data URI and needs none
    // of this.
    const images = (results.filter(Boolean) as { index: number; image: SlideImage }[])
      .map(({ index, image }) => ({
        index,
        image: image.source === "stock"
          ? { ...image, url: `/api/slide-image?u=${encodeURIComponent(image.url)}` }
          : image,
      }));
    return NextResponse.json({
      images,
      note: images.length === 0 ? "No pictures could be found for this deck." : undefined,
    });
  } catch (err) {
    console.error("slide-images error:", err);
    captureRouteError(err, req, { route: "/api/slide-images", status: 200 });
    return NextResponse.json({ images: [], note: "Pictures could not be fetched this time." });
  }
}

/** What the tool is allowed to offer, so the UI does not show a switch that does nothing. */
export async function GET(req: Request) {
  const g = await guard(req, "presentation");
  if (!g.ok) return g.res;
  const cfg = await imageConfig();
  return NextResponse.json({
    stock: !!cfg.stockKey,
    ai: cfg.aiImagesEnabled,
    max: cfg.maxImagesPerDeck,
  });
}
