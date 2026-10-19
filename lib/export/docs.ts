/**
 * Export helpers for generated text (notes, plans, essays).
 *
 * PDF goes through the browser's own print dialog rather than a PDF library:
 * the page has already rendered the maths and code correctly, and printing keeps
 * that, where a PDF library would re-draw everything and lose it.
 */

const safeName = (s: string, fallback = "eluna") =>
  (s || fallback).replace(/[^\w\s-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || fallback;

function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadText(text: string, title: string) {
  save(new Blob([text], { type: "text/plain;charset=utf-8" }), `${safeName(title, "notes")}.txt`);
}

export function downloadMarkdown(text: string, title: string) {
  save(new Blob([text], { type: "text/markdown;charset=utf-8" }), `${safeName(title, "notes")}.md`);
}

/** Word document built from the markdown structure: headings, bullets, numbers, paragraphs. */
export async function downloadDocx(text: string, title: string) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ text: title || "Notes", heading: HeadingLevel.TITLE }),
  ];

  // Inline **bold** becomes real bold runs; everything else is plain text.
  const runs = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) =>
      p.startsWith("**") && p.endsWith("**") && p.length > 4
        ? new TextRun({ text: p.slice(2, -2), bold: true })
        : new TextRun(p)
    );

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { children.push(new Paragraph("")); continue; }

    const head = line.match(/^(#{1,4})\s+(.*)$/);
    if (head) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][head[1].length - 1];
      children.push(new Paragraph({ text: head[2], heading: level }));
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      children.push(new Paragraph({ children: runs(line.replace(/^\s*[-*•]\s+/, "")), bullet: { level: 0 } }));
      continue;
    }
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (num) {
      children.push(new Paragraph({ children: runs(num[1]), numbering: { reference: "eluna-numbers", level: 0 } }));
      continue;
    }
    children.push(new Paragraph({ children: runs(line) }));
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: "eluna-numbers",
        levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }],
      }],
    },
    sections: [{ children }],
  });

  save(await Packer.toBlob(doc), `${safeName(title, "notes")}.docx`);
}

/**
 * Opens the browser's print dialog for one element, so the user can save a PDF.
 * The element is copied into a clean window with the page's own stylesheets, which
 * keeps rendered maths and code looking the way they do on screen.
 */
export function printElement(el: HTMLElement | null, title: string) {
  if (!el) return false;
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return false;

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");

  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, "")}</title>${styles}
<style>
  @page { margin: 18mm; }
  body { background:#fff !important; color:#111 !important; font-family: Georgia, serif; }
  .print-body, .print-body * { color:#111 !important; background:transparent !important; border-color:#ddd !important; }
  .print-body pre, .print-body code { background:#f5f5f5 !important; color:#111 !important; }
  .print-body h1,.print-body h2,.print-body h3 { color:#000 !important; }
  .print-body a { color:#06c !important; }
  h1.print-title { font-size:22pt; margin:0 0 14pt; }
</style></head>
<body><h1 class="print-title">${title.replace(/[<>&]/g, "")}</h1><div class="print-body">${el.innerHTML}</div></body></html>`);
  w.document.close();
  // give the copied stylesheets a moment, otherwise the preview prints unstyled
  setTimeout(() => { w.focus(); w.print(); }, 450);
  return true;
}
