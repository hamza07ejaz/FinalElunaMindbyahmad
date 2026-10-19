"use client";
import React, { useEffect, useMemo, useState } from "react";

/**
 * Markdown, without the weight.
 *
 * KaTeX and highlight.js used to be imported at the top of this file. Because
 * the privacy policy, the terms and every blog post render through this
 * component, every visitor to those pages downloaded a maths typesetting engine
 * and a syntax highlighter to read plain prose — measured at 101 KB on top of a
 * 258 KB page, for libraries that page could never use.
 *
 * They are loaded on demand now. The text renders immediately either way; if it
 * contains a formula or a fenced code block, the library arrives a moment later
 * and that part re-renders. A page with neither never fetches them at all.
 */

/* ------------------------------------------------------------------ */
/* The two heavy libraries, fetched at most once each                  */
/* ------------------------------------------------------------------ */

type Katex = { renderToString: (src: string, opts: Record<string, unknown>) => string };
type Hljs = { highlight: (code: string, opts: { language: string }) => { value: string }; getLanguage: (n: string) => unknown };

let katexLib: Katex | null = null;
let hljsLib: Hljs | null = null;
let katexPending: Promise<void> | null = null;
let hljsPending: Promise<void> | null = null;

function loadKatex(): Promise<void> {
  // The stylesheet rides along with the library rather than sitting in the
  // layout, where it loaded on every page including ones with no maths.
  katexPending ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => { katexLib = (m.default ?? m) as unknown as Katex; });
  return katexPending;
}

/**
 * highlight.js with eleven languages, not the full build.
 *
 * The default export registers close to two hundred, which is most of the
 * library's size for languages a study app will never see.
 */
function loadHljs(): Promise<void> {
  hljsPending ??= (async () => {
    const [core, _css, ...langs] = await Promise.all([
      import("highlight.js/lib/core"),
      import("highlight.js/styles/github-dark.css").catch(() => null) as any,
      import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/typescript"),
      import("highlight.js/lib/languages/python"),
      import("highlight.js/lib/languages/java"),
      import("highlight.js/lib/languages/cpp"),
      import("highlight.js/lib/languages/csharp"),
      import("highlight.js/lib/languages/sql"),
      import("highlight.js/lib/languages/xml"),
      import("highlight.js/lib/languages/css"),
      import("highlight.js/lib/languages/json"),
      import("highlight.js/lib/languages/bash"),
    ]);
    const h = (core.default ?? core) as any;
    const names = ["javascript", "typescript", "python", "java", "cpp", "csharp", "sql", "xml", "css", "json", "bash"];
    langs.forEach((m, i) => h.registerLanguage(names[i], (m as any).default ?? m));
    h.registerAliases(["js", "jsx"], { languageName: "javascript" });
    h.registerAliases(["ts", "tsx"], { languageName: "typescript" });
    h.registerAliases(["py"], { languageName: "python" });
    h.registerAliases(["html"], { languageName: "xml" });
    h.registerAliases(["sh", "shell"], { languageName: "bash" });
    h.registerAliases(["c", "c++"], { languageName: "cpp" });
    hljsLib = h as Hljs;
  })();
  return hljsPending;
}

/** Cheap enough to run on every render; decides whether anything is fetched. */
const HAS_MATH = /\$\$[^$]+\$\$|\$[^$\n]+\$|\\\([^)]*\\\)/;
const HAS_CODE = /```/;

/** Render one TeX snippet. A bad formula shows as plain text instead of breaking the page. */
function tex(src: string, display: boolean, key: string) {
  try {
    if (!katexLib) throw new Error("katex not loaded yet");
    const html = katexLib.renderToString(src, { displayMode: display, throwOnError: false, strict: false, output: "html" });
    return <span key={key} className={display ? "my-3 block overflow-x-auto text-center" : ""} dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <code key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]">{src}</code>;
  }
}

/** Inline formatting: math, bold, italic, inline code, links. No raw HTML is ever injected. */
function inline(text: string, k: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // split on the things we handle, keeping the delimiters
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$|\\\([^)]*\\\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g);
  parts.forEach((p, i) => {
    const key = `${k}-${i}`;
    if (!p) return;
    if (p.startsWith("$$") && p.endsWith("$$") && p.length > 4) return out.push(tex(p.slice(2, -2), true, key));
    if (p.startsWith("\\(") && p.endsWith("\\)")) return out.push(tex(p.slice(2, -2), false, key));
    if (p.startsWith("$") && p.endsWith("$") && p.length > 2) return out.push(tex(p.slice(1, -1), false, key));
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return out.push(<code key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-lamp">{p.slice(1, -1)}</code>);
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
      return out.push(<strong key={key} className="font-semibold text-paper">{p.slice(2, -2)}</strong>);
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
      return out.push(<em key={key}>{p.slice(1, -1)}</em>);
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^https?:\/\//i.test(link[2]))
      return out.push(<a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-lamp underline underline-offset-2">{link[1]}</a>);
    out.push(<React.Fragment key={key}>{p}</React.Fragment>);
  });
  return out;
}

function CodeBlock({ code, lang, ready }: { code: string; lang: string; ready: boolean }) {
  const [copied, setCopied] = useState(false);
  // Until highlight.js has loaded this renders the code unhighlighted, which is
  // perfectly readable — the colours are an improvement, not a requirement.
  const html = useMemo(() => {
    if (!hljsLib) return null;
    // Only a language that is actually registered. The core build has no
    // "plaintext" grammar, so asking for one throws — and a block tagged with a
    // language nobody registered (```rust) is better left unhighlighted than
    // coloured by a guess.
    if (!lang || !hljsLib.getLanguage(lang)) return null;
    try {
      return hljsLib.highlight(code, { language: lang }).value;
    } catch { return null; }
  }, [code, lang, ready]);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-muted">{lang || "code"}</span>
        <button type="button" className="text-xs text-muted transition-colors hover:text-paper"
          onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.85rem] leading-relaxed">
        {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  );
}

const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l);
const isNum = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const isHead = (l: string) => /^#{1,4}\s/.test(l);
const isFence = (l: string) => l.trim().startsWith("```");
const isQuote = (l: string) => /^\s*>\s?/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|[\s:-]+\|\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  /**
   * Fetch a library only if this particular text needs it, and re-render once
   * it lands. `ready` is a counter rather than a boolean so a second library
   * arriving also triggers a render.
   */
  const needsMath = HAS_MATH.test(text);
  const needsCode = HAS_CODE.test(text);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setReady((n) => n + 1); };
    if (needsMath && !katexLib) void loadKatex().then(bump, () => {});
    if (needsCode && !hljsLib) void loadHljs().then(bump, () => {});
    return () => { alive = false; };
  }, [needsMath, needsCode]);

  const lines = text.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isFence(line)) {
      const lang = line.trim().slice(3).trim().toLowerCase();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(<CodeBlock key={key++} code={buf.join("\n")} lang={lang} ready={ready > 0} />);
    } else if (/^\s*\$\$\s*$/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(<div key={key++}>{tex(buf.join("\n"), true, `b${key}`)}</div>);
    } else if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="border-b border-white/15">{head.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold text-paper">{inline(h, `th${key}${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => (
              <tr key={ri} className="border-b border-white/5 last:border-0">
                {r.map((c, ci) => <td key={ci} className="px-3 py-2 align-top text-paper/80">{inline(c, `td${key}${ri}${ci}`)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      );
    } else if (isHead(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = line.replace(/^#+\s*/, "");
      const cls = level <= 1 ? "mt-5 mb-2 font-display text-xl text-paper"
        : level === 2 ? "mt-5 mb-2 font-display text-lg text-paper"
        : "mt-4 mb-1.5 font-display text-base text-lamp";
      out.push(<div key={key++} className={cls}>{inline(content, `h${key}`)}</div>);
      i++;
    } else if (isQuote(line)) {
      const buf: string[] = [];
      while (i < lines.length && isQuote(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={key++} className="my-3 border-l-2 border-lamp/60 pl-4 text-paper/75">{buf.map((t, j) => <p key={j}>{inline(t, `q${key}${j}`)}</p>)}</blockquote>);
    } else if (isBullet(line)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
      out.push(<ul key={key++} className="my-2 list-disc space-y-1.5 pl-5 marker:text-lamp">{items.map((t, j) => <li key={j}>{inline(t, `b${key}${j}`)}</li>)}</ul>);
    } else if (isNum(line)) {
      const items: string[] = [];
      while (i < lines.length && isNum(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      out.push(<ol key={key++} className="my-2 list-decimal space-y-1.5 pl-5 marker:text-lamp">{items.map((t, j) => <li key={j}>{inline(t, `n${key}${j}`)}</li>)}</ol>);
    } else if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      out.push(<hr key={key++} className="my-4 border-white/10" />);
      i++;
    } else if (line.trim() === "") {
      i++;
    } else {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !isFence(lines[i]) && !isHead(lines[i]) && !isBullet(lines[i]) && !isNum(lines[i]) && !isQuote(lines[i]) && !isTableRow(lines[i])) buf.push(lines[i++]);
      out.push(<p key={key++} className="my-2">{buf.map((t, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(t, `p${key}${j}`)}</React.Fragment>)}</p>);
    }
  }
  return <div className={`leading-relaxed text-[0.95rem] text-paper/85 ${className}`}>{out}</div>;
}
