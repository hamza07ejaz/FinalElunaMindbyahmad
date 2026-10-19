/**
 * PowerPoint export. The library is bundled (not loaded from a CDN) and pulled in
 * only when the user actually clicks Download, so it never slows the first page load.
 */
export type Slide = { title: string; bullets: string[]; notes?: string };

export type DeckTheme = {
  name: string;
  bg: string;        // slide background
  title: string;     // heading colour
  body: string;      // body text colour
  accent: string;    // rule + bullet colour
  titleBg?: string;  // cover slide background, if different
};

export const DECK_THEMES: DeckTheme[] = [
  { name: "Midnight", bg: "0B1020", title: "FFFFFF", body: "DCE3F2", accent: "F5B544", titleBg: "131A33" },
  { name: "Paper",    bg: "FBFAF7", title: "1A1A1A", body: "3C3C3C", accent: "C2410C", titleBg: "F1EDE4" },
  { name: "Ocean",    bg: "07242E", title: "FFFFFF", body: "CFE6EC", accent: "34D399", titleBg: "0B3340" },
  { name: "Plum",     bg: "1A1020", title: "FFFFFF", body: "E6DBF0", accent: "C084FC", titleBg: "261634" },
];

const safeName = (s: string) =>
  (s || "presentation").replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "presentation";

export async function downloadPptx(slides: Slide[], topic: string, theme: DeckTheme) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_16x9";          // 10in x 5.625in
  pptx.title = topic || "Presentation";
  pptx.company = "Eluna Mind";

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const cover = i === 0;
    slide.background = { color: cover ? (theme.titleBg ?? theme.bg) : theme.bg };

    if (cover) {
      slide.addText(s.title || topic, {
        x: 0.7, y: 1.9, w: 8.6, h: 1.5,
        fontSize: 40, bold: true, color: theme.title, fontFace: "Georgia", valign: "middle",
      });
      slide.addShape("rect", { x: 0.75, y: 3.45, w: 1.2, h: 0.055, fill: { color: theme.accent } });
      const sub = s.bullets.filter(Boolean).slice(0, 3).join("   ·   ");
      if (sub) {
        slide.addText(sub, { x: 0.7, y: 3.7, w: 8.6, h: 0.6, fontSize: 15, color: theme.body });
      }
    } else {
      slide.addText(s.title || `Slide ${i + 1}`, {
        x: 0.7, y: 0.45, w: 8.6, h: 0.8,
        fontSize: 26, bold: true, color: theme.title, fontFace: "Georgia",
      });
      slide.addShape("rect", { x: 0.72, y: 1.25, w: 0.8, h: 0.045, fill: { color: theme.accent } });

      const points = s.bullets.map((b) => String(b).trim()).filter(Boolean);
      if (points.length) {
        slide.addText(
          points.map((text) => ({ text, options: { breakLine: true } })),
          {
            x: 0.9, y: 1.65, w: 8.2, h: 3.4,
            fontSize: points.length > 6 ? 15 : 17,
            color: theme.body, lineSpacingMultiple: 1.35, paraSpaceAfter: 8,
            bullet: { characterCode: "2022", indent: 18 },
            valign: "top",
          }
        );
      }
      // slide number, bottom right
      slide.addText(String(i + 1), {
        x: 9.1, y: 5.0, w: 0.6, h: 0.3, fontSize: 10, color: theme.accent, align: "right",
      });
    }

    if (s.notes?.trim()) slide.addNotes(s.notes.trim());
  });

  await pptx.writeFile({ fileName: `${safeName(topic)}.pptx` });
}
