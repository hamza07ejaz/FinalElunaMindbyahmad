import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getSettings } from "../lib/settings";
import { siteHost } from "../lib/site";

/**
 * The picture people see before they see the site.
 *
 * Drawn here rather than shipped as a file so it follows the admin panel: rename
 * the site or change the tagline in Branding and every future share reflects it,
 * with no image to re-export.
 *
 * Two constraints shape how this is written. It is rendered by satori, which
 * supports a deliberate subset of CSS — flexbox only, no gradients on text, no
 * external stylesheets — so the layout is plain boxes and every colour is a
 * literal. And it has to read at thumbnail size in a chat list, which is why
 * there is one headline, one line under it, and nothing else competing.
 */

export const runtime = "nodejs";
/**
 * Regenerated at most once an hour.
 *
 * Without this Next bakes the card at build time, and the whole point of
 * reading the name and tagline from the admin panel is lost — renaming the site
 * would leave every share showing the old name until the next deploy.
 * Re-rendering on every request would be the other extreme: crawlers fetch this
 * repeatedly, and it is a few hundred milliseconds of work each time.
 */
export const revalidate = 3600;
export const alt = "Eluna Mind — an AI study tutor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SWEEP = ["#00f0d4", "#00b4fc", "#575af9", "#9653fa", "#e838fd"];

/**
 * The real mark, as a data URI.
 *
 * The PNG rather than app/icon.svg: satori renders an inline <svg> element not
 * at all, and an <img> pointing at an SVG data URI came out as blank space —
 * the card rendered fine and simply had a hole where the logo should be, which
 * is exactly the kind of failure nobody notices until a client shares a link.
 * A rasterised PNG is the one form it is guaranteed to draw.
 *
 * If the file cannot be read the card still renders, just without the mark.
 * A missing logo beats a failed image and a grey preview.
 */
async function markDataUri(): Promise<string | null> {
  try {
    const png = await readFile(join(process.cwd(), "public", "icon-192.png"));
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image() {
  const [{ branding }, mark] = await Promise.all([getSettings(), markDataUri()]);

  // A long tagline turns into four cramped lines at this width. Cutting it at a
  // word boundary reads better than letting it fill the card.
  const tagline = branding.tagline.length > 120
    ? `${branding.tagline.slice(0, 117).replace(/\s+\S*$/, "")}…`
    : branding.tagline;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", backgroundColor: "#05060e",
          padding: "72px 80px", position: "relative",
        }}
      >
        {/* The spectrum, as a bar rather than a glow: satori has no blur. */}
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 10 }}>
          {SWEEP.map((c, i) => (
            <div key={i} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mark} width={92} height={92} alt="" />
          ) : null}
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#edf1fb", letterSpacing: -1 }}>
            {branding.siteName}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              // 64, not 72: at 72 a headline of this length broke to a third
              // line holding two words, which reads as a mistake on a card.
              display: "flex", fontSize: 64, fontWeight: 700, color: "#edf1fb",
              lineHeight: 1.1, letterSpacing: -2, maxWidth: 1040,
            }}
          >
            {branding.heroHeadline}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#9aa6c4", lineHeight: 1.4, maxWidth: 920 }}>
            {tagline}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 26, color: "#c0b0ff" }}>{siteHost()}</div>
          <div style={{ display: "flex", gap: 10 }}>
            {SWEEP.map((c, i) => (
              <div key={i} style={{ width: 44, height: 6, borderRadius: 3, backgroundColor: c }} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
