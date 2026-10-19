/**
 * Readability, measured rather than guessed.
 *
 * Every number the Rewrite tool shows a student is computed here, in code. The
 * alternative — asking the model "what grade level is this?" — produces a
 * confident number that moves when you ask twice, which is worse than no number
 * at all. These are arithmetic: the same text always scores the same, and the
 * maths can be tested.
 *
 * None of this detects AI writing, and it is not meant to. It measures the
 * habits that make writing tiring to read, which AI drafts happen to have a lot
 * of and so do plenty of human ones.
 */

/* ------------------------------------------------------------------ */
/* Splitting text up                                                   */
/* ------------------------------------------------------------------ */

/** Things that end in a full stop without ending a sentence. */
const ABBREVIATIONS = [
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "lt", "col", "gen",
  "rev", "hon", "etc", "vs", "e.g", "i.e", "approx", "est", "fig", "no", "vol",
  "ed", "al", "inc", "ltd", "co", "dept", "univ", "ave", "blvd", "rd",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "a.m", "p.m", "u.s", "u.k", "u.n", "ph.d", "b.a", "m.a", "b.sc", "m.sc",
];

/**
 * Sentences.
 *
 * A plain split on `[.!?]` turns "Dr. Khan paid $3.50." into three sentences and
 * wrecks every average below it, so abbreviations, decimals and initials are all
 * stitched back together.
 */
export function sentences(text: string): string[] {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return [];

  const out: string[] = [];
  let current = "";

  const tokens = t.split(/(?<=[.!?…])(?:["')\]]*)\s+/);
  for (const token of tokens) {
    current = current ? `${current} ${token}` : token;

    const tail = current.trimEnd();
    // A decimal point, a mid-number separator: not an ending.
    if (/\d[.,]$/.test(tail)) continue;
    // A known abbreviation, or a single initial like "J." — not an ending.
    const lastWord = tail.split(/[\s("[]/).pop()!.toLowerCase().replace(/[")\]]+$/, "");
    if (ABBREVIATIONS.includes(lastWord.replace(/\.$/, ""))) continue;
    if (/^[a-z]\.$/i.test(lastWord)) continue;
    // Still no terminator at all: the text ran out mid-sentence.
    if (!/[.!?…]["')\]]*$/.test(tail)) continue;

    out.push(current.trim());
    current = "";
  }
  if (current.trim()) out.push(current.trim());
  return out.filter((s) => /[a-z0-9]/i.test(s));
}

/** Words, as a reader would count them: hyphens and apostrophes stay inside one word. */
export function words(text: string): string[] {
  return ((text ?? "").match(/[A-Za-zÀ-ɏ]+(?:['’-][A-Za-zÀ-ɏ]+)*|\d+(?:[.,]\d+)*/g) ?? []);
}

/* ------------------------------------------------------------------ */
/* Syllables                                                           */
/* ------------------------------------------------------------------ */

/** Words the vowel-group rule gets wrong often enough to be worth naming. */
const SYLLABLE_FIXES: Record<string, number> = {
  the: 1, every: 3, business: 3, people: 2, idea: 3, area: 3, being: 2, science: 2,
  create: 2, really: 3, quiet: 2, poem: 2, io: 2, maybe: 2, simile: 3, recipe: 3,
};

/**
 * How many syllables a word has, by counting vowel groups.
 *
 * A heuristic, and a well-known one: Flesch-Kincaid was defined on exactly this
 * kind of count, so being occasionally wrong on a single word is expected and
 * does not move an average over a paragraph.
 */
export function syllables(word: string): number {
  const w = (word ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (SYLLABLE_FIXES[w] !== undefined) return SYLLABLE_FIXES[w];
  if (w.length <= 3) return 1;

  let s = w.replace(/^y/, "");
  let extra = 0;

  // A consonant plus "-le" is its own syllable: "ta-ble", "sim-ple". Removing it
  // and adding one is not the same as leaving it in and adding one — that counted
  // "table" as three.
  if (/[^aeiouy]le$/.test(s)) {
    s = s.slice(0, -2);
    extra = 1;
  } else {
    // A silent "e" at the end does not sound: "make", "time".
    s = s.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, "");
  }

  // Vowel groups, greedily: "eau" in "beautiful" is one sound, not two.
  const groups = s.match(/[aeiouy]+/g);
  let count = (groups ? groups.length : 0) + extra;

  // "-tion", "-sion" and friends are one syllable, not two.
  if (/[^aeiou](?:tion|sion|cious|tious)$/.test(w)) count -= 1;

  return Math.max(1, count);
}

/* ------------------------------------------------------------------ */
/* The habits worth naming                                             */
/* ------------------------------------------------------------------ */

/**
 * Phrases that make a draft read as machine-written.
 *
 * Not a detector and not evidence of anything: these are simply overused, and a
 * student's own writing is stronger without them. Each one gets a plain-English
 * replacement, because "avoid this" with nothing to put in its place is useless.
 */
export const TIRED_PHRASES: { find: RegExp; phrase: string; instead: string }[] = [
  { find: /\bdelve\s+(?:in)?to\b/gi, phrase: "delve into", instead: "look at" },
  { find: /\bit(?:'s| is)\s+important\s+to\s+note\s+that\b/gi, phrase: "it's important to note that", instead: "cut it — say the thing" },
  { find: /\bit\s+is\s+worth\s+noting\s+that\b/gi, phrase: "it is worth noting that", instead: "cut it — say the thing" },
  { find: /\bin\s+today(?:'s)?\s+(?:fast[- ]paced|modern|digital)\s+world\b/gi, phrase: "in today's fast-paced world", instead: "cut it, or name the actual change" },
  { find: /\b(?:in|into|within)\s+the\s+(?:realm|world|sphere)\s+of\b/gi, phrase: "in the realm of", instead: "in" },
  { find: /\bnavigat\w*\s+the\s+(?:complexit|challeng|landscap)\w*\b/gi, phrase: "navigate the complexities", instead: "deal with" },
  { find: /\ba\s+testament\s+to\b/gi, phrase: "a testament to", instead: "shows" },
  { find: /\bplays?\s+a\s+(?:crucial|vital|pivotal|key|significant)\s+role\b/gi, phrase: "plays a crucial role", instead: "matters because…" },
  { find: /\b(?:rich|vibrant|intricate)\s+tapestry\b/gi, phrase: "rich tapestry", instead: "mix" },
  { find: /\bunlock(?:ing)?\s+the\s+(?:potential|power|secrets)\b/gi, phrase: "unlock the potential", instead: "use" },
  { find: /\bharness(?:ing)?\s+the\s+power\s+of\b/gi, phrase: "harness the power of", instead: "use" },
  { find: /\bshed\s+light\s+on\b/gi, phrase: "shed light on", instead: "explain" },
  { find: /\bembark\s+on\s+(?:a|this|the)\b/gi, phrase: "embark on a", instead: "start" },
  { find: /\bat\s+the\s+end\s+of\s+the\s+day\b/gi, phrase: "at the end of the day", instead: "cut it" },
  { find: /\bneedless\s+to\s+say\b/gi, phrase: "needless to say", instead: "cut it — then don't say it" },
  { find: /\bwhen\s+it\s+comes\s+to\b/gi, phrase: "when it comes to", instead: "for, or about" },
  { find: /\bin\s+order\s+to\b/gi, phrase: "in order to", instead: "to" },
  { find: /\bdue\s+to\s+the\s+fact\s+that\b/gi, phrase: "due to the fact that", instead: "because" },
  { find: /\bthe\s+fact\s+that\b/gi, phrase: "the fact that", instead: "that" },
  { find: /\ba\s+(?:myriad|plethora)\s+of\b/gi, phrase: "a myriad of", instead: "many" },
  { find: /\bfurthermore\b/gi, phrase: "furthermore", instead: "also, or nothing" },
  { find: /\bmoreover\b/gi, phrase: "moreover", instead: "also, or nothing" },
  { find: /\bin\s+conclusion\b/gi, phrase: "in conclusion", instead: "cut it — the reader can see the end" },
  { find: /\bmultifaceted\b/gi, phrase: "multifaceted", instead: "has several sides" },
  { find: /\bholistic\b/gi, phrase: "holistic", instead: "whole, or complete" },
  { find: /\bsynerg\w+\b/gi, phrase: "synergy", instead: "working together" },
  { find: /\bleverag\w+\b/gi, phrase: "leverage", instead: "use" },
  { find: /\bunderscor\w+\b/gi, phrase: "underscores", instead: "shows" },
  { find: /\bparamount\b/gi, phrase: "paramount", instead: "most important" },
  { find: /\bgame[- ]chang\w+\b/gi, phrase: "game-changer", instead: "say what it changed" },
  { find: /\bcutting[- ]edge\b/gi, phrase: "cutting-edge", instead: "new, or name the year" },
  { find: /\bseamless\w*\b/gi, phrase: "seamless", instead: "smooth, or cut it" },
  { find: /\brobust\b/gi, phrase: "robust", instead: "strong, or say how" },
  { find: /\bever[- ]evolving\b/gi, phrase: "ever-evolving", instead: "changing" },
];

/**
 * Passive clauses: a form of "to be" followed by a past participle.
 *
 * Regular participles end in -ed, -en or -wn; the common irregular ones have to
 * be named, because "mistakes were made" is the most passive sentence in English
 * and "made" fits no pattern. Matching any word ending in "t" would have caught
 * them but also every "is great" and "is not", so it is a list instead.
 */
const IRREGULAR = [
  "made", "done", "put", "set", "cut", "run", "begun", "said", "paid", "led", "met",
  "lost", "won", "sold", "told", "held", "kept", "left", "sent", "built", "spent",
  "meant", "felt", "dealt", "taught", "bought", "brought", "caught", "thought",
  "fought", "found", "read", "hit", "let", "shut", "got", "sought", "built",
];
const PASSIVE_CANDIDATE = new RegExp(
  String.raw`\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+)\b`, "gi",
);
/** Words that end like a participle but are plain adjectives or nouns. */
const NOT_PARTICIPLES = new Set([
  "open", "often", "even", "seven", "eleven", "garden", "golden", "wooden", "sudden",
  "kitchen", "children", "women", "men", "token", "oxygen", "citizen", "when", "then",
  "green", "keen", "between", "dozen", "frozen", "linen", "oxen", "siren", "listen",
]);

function passiveClauses(text: string): number {
  let n = 0;
  for (const m of (text ?? "").matchAll(PASSIVE_CANDIDATE)) {
    const participle = m[1].toLowerCase();
    if (NOT_PARTICIPLES.has(participle)) continue;
    if (/(?:ed|en|wn)$/.test(participle) || IRREGULAR.includes(participle)) n++;
  }
  return n;
}

/** Words that pad a sentence without adding to it. */
const HEDGES = /\b(?:very|really|quite|rather|somewhat|fairly|basically|actually|literally|simply|just|essentially|arguably|perhaps|possibly|generally|typically|often|usually)\b/gi;

/** Words ending in "-ly" that are not adverbs. "Reply" is the obvious one. */
const NOT_ADVERBS = new Set([
  "reply", "apply", "supply", "imply", "multiply", "rely", "comply", "simply", "reply",
  "family", "assembly", "anomaly", "monopoly", "only", "early", "ugly", "holy", "jolly",
  "silly", "belly", "jelly", "rally", "bully", "ally", "july", "italy", "panoply",
  "butterfly", "firefly", "supply", "oddly",
]);

const count = (text: string, re: RegExp) => ((text ?? "").match(re) ?? []).length;

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

export type Report = {
  words: number;
  sentences: number;
  /** US school grade a reader needs. 8 or below reads easily for most people. */
  grade: number;
  /** Flesch reading ease, 0–100. Higher is easier. */
  ease: number;
  avgSentence: number;
  /** How much sentence length varies. Near zero is the monotone that tires a reader. */
  rhythm: number;
  longestSentence: number;
  passive: number;
  hedges: number;
  adverbs: number;
  emDashes: number;
  /** Overused phrases found, with something to use instead. */
  tired: { phrase: string; instead: string; times: number }[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Measure a piece of writing. Safe on an empty string. */
export function analyse(text: string): Report {
  const t = text ?? "";
  const ss = sentences(t);
  const ws = words(t);
  const lengths = ss.map((s) => words(s).length).filter((n) => n > 0);

  const wordCount = ws.length;
  const sentenceCount = lengths.length;
  const syllableCount = ws.reduce((n, w) => n + syllables(w), 0);

  const perSentence = sentenceCount ? wordCount / sentenceCount : 0;
  const perWord = wordCount ? syllableCount / wordCount : 0;

  // Standard deviation of sentence length: the plainest measure of rhythm.
  const mean = sentenceCount ? lengths.reduce((a, b) => a + b, 0) / sentenceCount : 0;
  const variance = sentenceCount ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / sentenceCount : 0;

  const tired = TIRED_PHRASES
    .map(({ find, phrase, instead }) => ({ phrase, instead, times: count(t, find) }))
    .filter((x) => x.times > 0)
    .sort((a, b) => b.times - a.times);

  return {
    words: wordCount,
    sentences: sentenceCount,
    // Flesch-Kincaid grade level.
    grade: sentenceCount ? Math.max(0, round1(0.39 * perSentence + 11.8 * perWord - 15.59)) : 0,
    // Flesch reading ease, clamped to the scale it is reported on.
    ease: sentenceCount ? Math.min(100, Math.max(0, round1(206.835 - 1.015 * perSentence - 84.6 * perWord))) : 0,
    avgSentence: round1(perSentence),
    rhythm: round1(Math.sqrt(variance)),
    longestSentence: lengths.length ? Math.max(...lengths) : 0,
    passive: passiveClauses(t),
    hedges: count(t, HEDGES),
    adverbs: ws.filter((w) => /ly$/i.test(w) && w.length > 4 && !NOT_ADVERBS.has(w.toLowerCase())).length,
    emDashes: count(t, /—|--/g),
    tired,
  };
}

/* ------------------------------------------------------------------ */
/* What to tell the student                                            */
/* ------------------------------------------------------------------ */

export type Note = { label: string; detail: string; tone: "good" | "watch" | "bad" };

/**
 * The report in words.
 *
 * Thresholds are deliberately loose. A number on its own invites a student to
 * chase it, and writing that has been tuned to hit a score reads worse than
 * writing that was left alone.
 */
export function notes(r: Report): Note[] {
  const out: Note[] = [];
  if (!r.sentences) return out;

  out.push(
    r.grade <= 10
      ? { label: "Reading level", detail: `Grade ${r.grade} — most readers will follow this first time.`, tone: "good" }
      : r.grade <= 14
        ? { label: "Reading level", detail: `Grade ${r.grade} — fine for an academic reader, heavy for anyone else.`, tone: "watch" }
        : { label: "Reading level", detail: `Grade ${r.grade} — a reader has to work. Usually long sentences, not hard ideas.`, tone: "bad" },
  );

  if (r.avgSentence > 25)
    out.push({ label: "Sentence length", detail: `${r.avgSentence} words on average. Split the longest one (${r.longestSentence} words) and the rest will follow.`, tone: "bad" });
  else if (r.avgSentence > 20)
    out.push({ label: "Sentence length", detail: `${r.avgSentence} words on average — a little long, but readable.`, tone: "watch" });
  else
    out.push({ label: "Sentence length", detail: `${r.avgSentence} words on average, which is comfortable.`, tone: "good" });

  if (r.sentences >= 4) {
    out.push(
      r.rhythm < 4
        ? { label: "Rhythm", detail: "Almost every sentence is the same length. That flatness is what makes a page tiring — a short one after a long one fixes it.", tone: "bad" }
        : r.rhythm < 6
          ? { label: "Rhythm", detail: "Sentence lengths are a bit uniform. One or two short sentences would lift it.", tone: "watch" }
          : { label: "Rhythm", detail: "Sentence lengths vary, so the writing has a pulse.", tone: "good" },
    );
  }

  const passiveShare = r.sentences ? r.passive / r.sentences : 0;
  if (passiveShare > 0.4)
    out.push({ label: "Passive voice", detail: `${r.passive} passive clauses. Name who did the thing: "the data was collected" → "we collected the data".`, tone: "bad" });
  else if (r.passive > 0)
    out.push({ label: "Passive voice", detail: `${r.passive} passive clauses, which is normal for academic writing.`, tone: "good" });

  const hedgeShare = r.words ? r.hedges / r.words : 0;
  if (hedgeShare > 0.03)
    out.push({ label: "Filler words", detail: `${r.hedges} hedges like "very", "really", "basically". Deleting them changes nothing and sharpens everything.`, tone: "bad" });

  if (r.tired.length)
    out.push({
      label: "Overused phrases",
      detail: `${r.tired.length} found${r.tired.length > 2 ? `, starting with "${r.tired[0].phrase}"` : ""}. These are the phrases every draft on this topic already uses.`,
      tone: r.tired.length > 4 ? "bad" : "watch",
    });

  if (r.emDashes > Math.max(2, r.sentences * 0.4))
    out.push({ label: "Em dashes", detail: `${r.emDashes} em dashes. A few are fine; this many is a tic, and commas or a full stop usually read better.`, tone: "watch" });

  return out;
}

/** Before and after, as the change in each number that matters. */
export function compare(before: Report, after: Report) {
  return {
    grade: round1(after.grade - before.grade),
    ease: round1(after.ease - before.ease),
    avgSentence: round1(after.avgSentence - before.avgSentence),
    rhythm: round1(after.rhythm - before.rhythm),
    words: after.words - before.words,
    passive: after.passive - before.passive,
    hedges: after.hedges - before.hedges,
    tired: after.tired.reduce((n, t) => n + t.times, 0) - before.tired.reduce((n, t) => n + t.times, 0),
  };
}
