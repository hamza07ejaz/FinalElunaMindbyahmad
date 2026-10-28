/**
 * Markdown out of text that will never be rendered as markdown.
 *
 * Every tool shares one voice, and that voice asks the model to **bold** the
 * terms a student would be tested on. That is right for the tools whose output
 * goes through a markdown renderer — notes, the study plan, the career guide.
 *
 * It is wrong for the ones that do not. A flashcard, a quiz question, a slide
 * bullet and a citation are all printed as plain text, so the model's asterisks
 * arrive on screen as asterisks. The student sees "**Photosynthesis** is the
 * process…" and reasonably concludes the app is broken.
 *
 * Telling the prompt not to use markdown helps and does not settle it: models
 * reach for emphasis whatever they are told, especially partway through a long
 * list. So the text is cleaned on the way out as well. Prompt and sanitiser
 * together — one for the usual case, one for the day the model forgets.
 */

/** Emphasis, code ticks, headings and list markers — removed, text kept. */
/** Characters a model escapes when it means them literally. */
const ESCAPABLE = "*_~`#[]()$";

export function plainText(input: unknown, max = 2000): string {
  let s = String(input ?? "");

  /*
   * Hide escaped characters before anything else looks at them.
   *
   * "\*not\*" means a literal pair of asterisks, but to the emphasis pattern it
   * is indistinguishable from "*not*" — the backslash sits outside the match.
   * Stripping first produced "\not\": the markers survived and the escape did
   * not, which is the exact opposite of what was asked for. So each escaped
   * character becomes a private-use placeholder, invisible to every rule below,
   * and comes back as itself at the end.
   */
  const stash = (c: string) => `${ESCAPABLE.indexOf(c)}`;
  s = s.replace(/\\(.)/g, (whole, c: string) => (ESCAPABLE.includes(c) ? stash(c) : whole));

  // Fenced code blocks: keep the code, drop the fence and its language tag.
  s = s.replace(/```[a-z0-9+#-]*\n?/gi, "");

  // Bold, italic and bold-italic, in either marker. Done innermost-first so
  // ***both*** collapses properly rather than leaving a stray asterisk.
  // The content cannot start or end with a space, which is what keeps a lone
  // "2 * 3 * 4" from being read as emphasis.
  for (let i = 0; i < 3; i++) {
    s = s.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, "$2");
    s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
    s = s.replace(/(?<![*\w])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1");
    s = s.replace(/(?<![_\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1");
  }

  // Inline code and strikethrough.
  s = s.replace(/`{1,3}([^`]+)`{1,3}/g, "$1");
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");

  // [text](url) → text. The link itself is noise in a flashcard.
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Leading list markers, blockquotes and heading hashes, line by line.
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");
  s = s.replace(/^[ \t]*[-*+•][ \t]+/gm, "");
  s = s.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");

  // The escaped characters come back as themselves, now that nothing else
  // will mistake them for markup.
  s = s.replace(/(\d+)/g, (_, i: string) => ESCAPABLE[Number(i)] ?? "");

  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/** Every string in an object, cleaned. Arrays and nested objects included. */
export function plainDeep<T>(value: T, max = 2000): T {
  if (typeof value === "string") return plainText(value, max) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => plainDeep(v, max)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = plainDeep(v, max);
    return out as T;
  }
  return value;
}

/** Added to the prompts of tools whose output is printed as it stands. */
export const PLAIN_ONLY =
  "Write plain text only. No markdown of any kind: no asterisks for bold or italic, no backticks, " +
  "no hash headings, no leading dashes or numbers. This text is shown exactly as you write it.";
