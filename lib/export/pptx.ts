/**
 * PowerPoint export. The library is bundled (not loaded from a CDN) and pulled in
 * only when the user actually clicks Download, so it never slows the first page load.
 *
 * Every slide used to be a title with bullets under it. Ten of those in a row is
 * the deck everyone recognises and nobody watches. The layouts below exist to
 * break that rhythm: a section divider to mark a turn in the argument, a figure
 * beside the text, a single number when a number is the point, a quote when
 * somebody said it better. The AI picks one per slide, and anything it picks
 * that we do not know about falls back to bullets.
 */

export type SlideLayout =
  | "cover"      // first slide: title, rule, subtitle
  | "section"    // a divider announcing the next part
  | "bullets"    // the workhorse
  | "image"      // text one side, picture the other
  | "feature"    // picture across the whole slide, text over a scrim
  | "quote"      // bullets[0] is the quote, bullets[1] the attribution
  | "stat"       // bullets[0] is the number, bullets[1] the caption
  | "closing";   // what to remember

export const SLIDE_LAYOUTS: SlideLayout[] =
  ["cover", "section", "bullets", "image", "feature", "quote", "stat", "closing"];

export type SlideImage = {
  url: string;
  alt: string;
  /** Photographer or model name. Shown small on the slide: stock licences ask for it. */
  credit?: string;
  source: "stock" | "ai";
};

export type Slide = {
  title: string;
  bullets: string[];
  notes?: string;
  layout?: SlideLayout;
  /** What the slide should show a picture of. Written by the AI, used to fetch one. */
  imageQuery?: string;
  image?: SlideImage | null;
};

export type DeckTheme = {
  name: string;
  bg: string;        // slide background
  title: string;     // heading colour
  body: string;      // body text colour
  accent: string;    // rule + bullet colour
  titleBg?: string;  // cover and section background, if different
  /** Dark themes need light text over a photo; light themes need the opposite. */
  dark: boolean;
};

export const DECK_THEMES: DeckTheme[] = [
  { name: "Midnight", bg: "0B1020", title: "FFFFFF", body: "DCE3F2", accent: "F5B544", titleBg: "131A33", dark: true },
  { name: "Paper",    bg: "FBFAF7", title: "1A1A1A", body: "3C3C3C", accent: "C2410C", titleBg: "F1EDE4", dark: false },
  { name: "Ocean",    bg: "07242E", title: "FFFFFF", body: "CFE6EC", accent: "34D399", titleBg: "0B3340", dark: true },
  { name: "Plum",     bg: "1A1020", title: "FFFFFF", body: "E6DBF0", accent: "C084FC", titleBg: "261634", dark: true },
  { name: "Sand",     bg: "F6F1E7", title: "27211B", body: "4A4038", accent: "B45309", titleBg: "EDE4D3", dark: false },
  { name: "Slate",    bg: "16181D", title: "F5F6F7", body: "C8CCD4", accent: "60A5FA", titleBg: "1F232B", dark: true },
];

const safeName = (s: string) =>
  (s || "presentation").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "presentation";

/** 16:9 at pptxgenjs's default inch scale. */
const W = 10;
const H = 5.625;

/**
 * Work out the layout actually used for a slide.
 *
 * The AI's choice is a suggestion. A slide asking for a picture that never
 * arrived has to become something else, or it exports as a title floating
 * beside an empty rectangle.
 */
export function resolveLayout(s: Slide, index: number, total: number): SlideLayout {
  const wanted = s.layout && SLIDE_LAYOUTS.includes(s.layout) ? s.layout : null;
  // Trim before counting. filter(Boolean) keeps "   ", so a stat slide whose
  // caption was a few spaces counted as having one and exported as a number
  // with nothing underneath it.
  const filled = s.bullets.filter((b) => String(b).trim().length > 0).length;
  if (index === 0) return "cover";
  if (wanted === "cover") return "bullets";          // only the first slide may be the cover
  if ((wanted === "image" || wanted === "feature") && !s.image?.url) return "bullets";
  if (wanted === "quote" && filled < 1) return "bullets";
  if (wanted === "stat" && filled < 2) return "bullets";
  if (wanted) return wanted;
  return index === total - 1 ? "closing" : "bullets";
}

export async function downloadPptx(slides: Slide[], topic: string, theme: DeckTheme) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_16x9";
  pptx.title = topic || "Presentation";
  pptx.company = "Eluna Mind";

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const layout = resolveLayout(s, i, slides.length);
    const points = s.bullets.map((b) => String(b).trim()).filter(Boolean);
    const panel = layout === "cover" || layout === "section";
    slide.background = { color: panel ? (theme.titleBg ?? theme.bg) : theme.bg };

    const rule = (x: number, y: number, w = 1.2) =>
      slide.addShape("rect", { x, y, w, h: 0.055, fill: { color: theme.accent } });

    /** The photographer credit. Small, quiet, and required by the licence. */
    const credit = (x: number, y: number, w: number, align: "left" | "right" = "left") => {
      if (!s.image?.credit) return;
      slide.addText(s.image.credit, {
        x, y, w, h: 0.22, fontSize: 7, color: theme.body, align, transparency: 45,
      });
    };

    if (layout === "cover") {
      slide.addText(s.title || topic, {
        x: 0.7, y: 1.75, w: 8.6, h: 1.6,
        fontSize: 40, bold: true, color: theme.title, fontFace: "Georgia", valign: "middle",
      });
      rule(0.75, 3.45);
      const sub = points.slice(0, 3).join("   ·   ");
      if (sub) slide.addText(sub, { x: 0.7, y: 3.7, w: 8.6, h: 0.6, fontSize: 15, color: theme.body });

    } else if (layout === "section") {
      // A divider earns its place by being almost empty.
      slide.addText(String(i + 1).padStart(2, "0"), {
        x: 0.75, y: 1.6, w: 2, h: 0.6, fontSize: 15, bold: true, color: theme.accent,
      });
      slide.addText(s.title || "", {
        x: 0.7, y: 2.15, w: 8.6, h: 1.5,
        fontSize: 34, bold: true, color: theme.title, fontFace: "Georgia", valign: "middle",
      });
      rule(0.75, 3.6, 0.9);
      if (points[0]) {
        slide.addText(points[0], { x: 0.7, y: 3.85, w: 7.2, h: 0.6, fontSize: 14, color: theme.body });
      }

    } else if (layout === "feature") {
      // Full-bleed picture with the text over a band, so it stays readable
      // whatever the photo turns out to look like.
      slide.addImage({ path: s.image!.url, x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
      // The band and the text on it are the same whatever the theme. A light
      // theme used to put its dark title over whatever photograph arrived, and
      // the photograph is the one element nobody chose: a dark image made the
      // title vanish. White on a dark wash survives any picture.
      slide.addShape("rect", { x: 0, y: H - 2.35, w: W, h: 2.35, fill: { color: "000000", transparency: 15 } });
      slide.addText(s.title || "", {
        x: 0.7, y: H - 2.05, w: 8.6, h: 0.9,
        fontSize: 28, bold: true, color: "FFFFFF", fontFace: "Georgia", valign: "middle",
      });
      if (points.length) {
        slide.addText(points.slice(0, 3).map((text) => ({ text, options: { breakLine: true } })), {
          x: 0.9, y: H - 1.1, w: 8.2, h: 0.85, fontSize: 13, color: "E8EAF0",
          bullet: { characterCode: "2022", indent: 16 }, lineSpacingMultiple: 1.2,
        });
      }
      if (s.image?.credit) {
        slide.addText(s.image.credit, { x: 0.7, y: H - 0.3, w: 4, h: 0.22, fontSize: 7, color: "FFFFFF", transparency: 55 });
      }

    } else if (layout === "image") {
      // Alternate the side so consecutive figure slides do not look identical.
      const imageRight = i % 2 === 1;
      const imgX = imageRight ? 5.35 : 0;
      const txtX = imageRight ? 0.7 : 5.25;
      slide.addImage({ path: s.image!.url, x: imgX, y: 0, w: 4.65, h: H, sizing: { type: "cover", w: 4.65, h: H } });
      slide.addText(s.title || "", {
        x: txtX, y: 0.75, w: 4.05, h: 1.1,
        fontSize: 22, bold: true, color: theme.title, fontFace: "Georgia", valign: "top",
      });
      rule(txtX + 0.02, 1.95, 0.7);
      if (points.length) {
        slide.addText(points.slice(0, 5).map((text) => ({ text, options: { breakLine: true } })), {
          x: txtX + 0.18, y: 2.25, w: 3.85, h: 2.6,
          fontSize: points.length > 4 ? 12 : 13.5, color: theme.body,
          bullet: { characterCode: "2022", indent: 15 }, lineSpacingMultiple: 1.3, valign: "top",
        });
      }
      credit(imgX + 0.15, H - 0.3, 2.5);

    } else if (layout === "quote") {
      slide.addText("“", {
        x: 0.6, y: 0.7, w: 1.2, h: 1.2, fontSize: 80, bold: true, color: theme.accent, fontFace: "Georgia",
      });
      slide.addText(points[0] ?? "", {
        x: 1.3, y: 1.5, w: 7.6, h: 2.3,
        fontSize: points[0] && points[0].length > 140 ? 19 : 24,
        italic: true, color: theme.title, fontFace: "Georgia", valign: "middle", lineSpacingMultiple: 1.25,
      });
      if (points[1]) {
        rule(1.35, 4.0, 0.5);
        slide.addText(points[1], { x: 1.3, y: 4.2, w: 7.6, h: 0.45, fontSize: 13, color: theme.body });
      }

    } else if (layout === "stat") {
      slide.addText(points[0] ?? "", {
        x: 0.7, y: 1.2, w: 8.6, h: 1.9,
        fontSize: 76, bold: true, color: theme.accent, fontFace: "Georgia", align: "center", valign: "middle",
      });
      slide.addText(points[1] ?? "", {
        x: 1.4, y: 3.15, w: 7.2, h: 0.9, fontSize: 17, color: theme.title, align: "center", valign: "top",
      });
      if (s.title) {
        slide.addText(s.title, { x: 1.4, y: 0.6, w: 7.2, h: 0.5, fontSize: 13, color: theme.body, align: "center" });
      }

    } else {
      // bullets and closing
      const closing = layout === "closing";
      slide.addText(s.title || `Slide ${i + 1}`, {
        x: 0.7, y: 0.45, w: 8.6, h: 0.8,
        fontSize: closing ? 30 : 26, bold: true, color: theme.title, fontFace: "Georgia",
      });
      rule(0.72, closing ? 1.35 : 1.25, closing ? 1.1 : 0.8);
      if (points.length) {
        slide.addText(points.map((text) => ({ text, options: { breakLine: true } })), {
          x: 0.9, y: closing ? 1.8 : 1.65, w: 8.2, h: 3.4,
          fontSize: closing ? 18 : points.length > 6 ? 15 : 17,
          color: theme.body, lineSpacingMultiple: 1.35, paraSpaceAfter: 8,
          bullet: { characterCode: "2022", indent: 18 }, valign: "top",
        });
      }
    }

    // Slide number on everything except the cover.
    if (layout !== "cover") {
      slide.addText(String(i + 1), {
        x: 9.1, y: 5.0, w: 0.6, h: 0.3, fontSize: 10, color: theme.accent, align: "right",
      });
    }

    if (s.notes?.trim()) slide.addNotes(s.notes.trim());
  });

  await pptx.writeFile({ fileName: `${safeName(topic)}.pptx` });
}
