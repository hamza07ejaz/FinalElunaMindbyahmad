/**
 * A word-level diff, so a student can see what the rewrite actually changed.
 *
 * Computed here rather than asked of the model. A model asked "what did you
 * change?" writes a plausible summary of changes it may not have made; this is
 * the real answer, derived from the two texts.
 */

export type Piece = { text: string; kind: "same" | "added" | "removed" };

/**
 * Split into words, each carrying the whitespace that follows it.
 *
 * Whitespace as its own token looked tidier and rendered as confetti: when every
 * word changes, the unchanged spaces between them chop the diff into
 * removed/added/space/removed/added pairs instead of one clean before and after.
 * Runs of spaces and tabs collapse first so that re-spacing alone is not a change.
 */
function tokenise(text: string): string[] {
  return ((text ?? "").replace(/[ \t]+/g, " ").match(/\S+\s*/g) ?? []);
}

const isSpace = (s: string) => /^\s+$/.test(s);

/**
 * Longest common subsequence, walked back into a list of pieces.
 *
 * O(n·m) in time and memory. The input cap (6,000 characters, so roughly 1,000
 * words a side) keeps that at about a million cells, which is a few
 * milliseconds — but `MAX_TOKENS` below is the guard that stops a future caller
 * raising the cap and quietly making this the slowest thing in the request.
 */
const MAX_TOKENS = 4000;

export function diffWords(before: string, after: string): Piece[] {
  const a = tokenise(before);
  const b = tokenise(after);

  if (!a.length && !b.length) return [];
  if (!a.length) return [{ text: b.join(""), kind: "added" }];
  if (!b.length) return [{ text: a.join(""), kind: "removed" }];

  // Too much to diff cell by cell: say so plainly rather than freezing the request.
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [{ text: before, kind: "removed" }, { text: after, kind: "added" }];
  }

  // Trim the matching head and tail first. Most rewrites leave both alone, and
  // this is what keeps the table small enough to be cheap.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head && tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) tail++;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const n = midA.length, m = midB.length;
  // lcs[i][j] = length of the longest common subsequence of midA[i:] and midB[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const pieces: Piece[] = [];
  const push = (text: string, kind: Piece["kind"]) => {
    if (!text) return;
    const last = pieces[pieces.length - 1];
    if (last && last.kind === kind) last.text += text;
    else pieces.push({ text, kind });
  };

  if (head) push(a.slice(0, head).join(""), "same");

  let i = 0, j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) { push(midA[i], "same"); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push(midA[i], "removed"); i++; }
    else { push(midB[j], "added"); j++; }
  }
  while (i < n) { push(midA[i], "removed"); i++; }
  while (j < m) { push(midB[j], "added"); j++; }

  if (tail) push(a.slice(a.length - tail).join(""), "same");

  // Whitespace marked as changed on its own is visual noise, not information.
  return tidy(pieces.filter((p) => !(p.kind !== "same" && isSpace(p.text))));
}

/** Words that are in both texts by coincidence rather than survival. */
const MIN_SURVIVING_WORDS = 4;

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

/**
 * Make a heavy rewrite readable.
 *
 * The raw longest-common-subsequence is correct and unreadable: in a rewritten
 * paragraph it keeps every stray "the", "a" and "to" as unchanged, which chops
 * the result into word-by-word confetti that nobody can read. So two passes.
 *
 * First, a very short run of unchanged words sitting between two changes is
 * treated as part of the change — it belongs to both texts, so it is emitted on
 * both sides and the rebuild stays exact. Then each run of changes is grouped so
 * that everything removed is shown together, followed by everything added,
 * instead of alternating a word at a time.
 */
function tidy(pieces: Piece[]): Piece[] {
  const absorbed: Piece[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const prev = pieces[i - 1];
    const next = pieces[i + 1];
    const strandedBetweenChanges =
      p.kind === "same" && prev && next && prev.kind !== "same" && next.kind !== "same" &&
      wordCount(p.text) < MIN_SURVIVING_WORDS;

    if (strandedBetweenChanges) {
      absorbed.push({ text: p.text, kind: "removed" }, { text: p.text, kind: "added" });
    } else {
      absorbed.push(p);
    }
  }

  const out: Piece[] = [];
  let i = 0;
  while (i < absorbed.length) {
    if (absorbed[i].kind === "same") {
      const last = out[out.length - 1];
      if (last?.kind === "same") last.text += absorbed[i].text;
      else out.push({ ...absorbed[i] });
      i++;
      continue;
    }
    let removed = "", added = "";
    while (i < absorbed.length && absorbed[i].kind !== "same") {
      if (absorbed[i].kind === "removed") removed += absorbed[i].text;
      else added += absorbed[i].text;
      i++;
    }
    if (removed) out.push({ text: removed, kind: "removed" });
    if (added) out.push({ text: added, kind: "added" });
  }
  return out;
}

/** How much of the text the rewrite touched, as a share of the words. */
export function changedShare(pieces: Piece[]): number {
  const wordsIn = (s: string) => (s.match(/[^\s]+/g) ?? []).length;
  let same = 0, changed = 0;
  for (const p of pieces) {
    const n = wordsIn(p.text);
    if (p.kind === "same") same += n;
    else changed += n;
  }
  const total = same + changed;
  return total ? Math.round((changed / total) * 100) : 0;
}
