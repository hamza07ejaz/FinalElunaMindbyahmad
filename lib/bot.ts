import { supabaseAdmin } from "./supabase/admin";

/**
 * The landing bot's brain.
 *
 * Written answers are tried first. They are instant, cost nothing, cannot
 * wander off message, and are the ones an admin controls. Only a question the
 * written set does not cover reaches the AI, and that path is capped hard
 * because the endpoint is public: anyone can call it without an account.
 */

export type BotAnswer = {
  id: string;
  question: string;
  answer: string;
  keywords: string;
  suggested: boolean;
  enabled: boolean;
  sort: number;
};

export const MAX_QUESTION = 300;

/** Words too common to tell two questions apart. */
const STOP = new Set([
  "a", "an", "the", "is", "are", "am", "do", "does", "did", "can", "could", "will", "would",
  "i", "me", "my", "you", "your", "it", "its", "this", "that", "these", "those", "to", "of",
  "in", "on", "for", "with", "and", "or", "but", "if", "so", "be", "been", "have", "has",
  "how", "what", "why", "when", "where", "who", "which", "there", "here", "about", "from",
  "get", "got", "use", "using", "any", "all", "some", "much", "many", "really", "just",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    // Light stemming: "uploads"/"uploading" should reach "upload".
    .map((w) => w.replace(/(ing|ed|es|s)$/, (m, _g, off: number) => (off >= 4 ? "" : m)))
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Score one answer against a question. The score is a fraction of the asker's
 * own meaningful words that the answer covers, so a long answer does not win
 * just by containing more text.
 */
export function scoreAnswer(askTokens: string[], a: Pick<BotAnswer, "question" | "keywords" | "answer">): number {
  if (!askTokens.length) return 0;

  const kw = new Set(tokenise(a.keywords));
  const q = new Set(tokenise(a.question));
  const body = new Set(tokenise(a.answer));

  let score = 0;
  for (const t of askTokens) {
    // A keyword the admin chose deliberately is the strongest signal; the
    // answer's own prose is the weakest, since it mentions a lot in passing.
    if (kw.has(t)) score += 1;
    else if (q.has(t)) score += 0.8;
    else if (body.has(t)) score += 0.25;
  }
  return score / askTokens.length;
}

/** Below this, the written answers are not a real match and the AI takes over. */
export const MATCH_THRESHOLD = 0.5;

export function bestMatch(question: string, answers: BotAnswer[]) {
  const tokens = tokenise(question);
  let best: { answer: BotAnswer; score: number } | null = null;
  for (const a of answers) {
    if (!a.enabled) continue;
    const score = scoreAnswer(tokens, a);
    if (!best || score > best.score) best = { answer: a, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

export async function loadAnswers(): Promise<BotAnswer[]> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("bot_answers").select("*").eq("enabled", true).order("sort");
    if (error) throw new Error(error.message);
    return (data ?? []) as BotAnswer[];
  } catch (err) {
    // Before migration 009 the table does not exist; the bot then runs on the
    // AI path alone rather than failing to open.
    console.error("bot answers unavailable:", (err as Error)?.message);
    return [];
  }
}

/** Record what was asked. The misses are the valuable half. */
export async function logQuestion(question: string, matchedId: string | null, source: "answers" | "ai" | "none") {
  try {
    await supabaseAdmin().from("bot_questions").insert({
      question: question.slice(0, MAX_QUESTION), matched_id: matchedId, source,
    });
    if (matchedId) {
      await supabaseAdmin().rpc("bump_bot_answer", { p_id: matchedId }).then(
        () => {},
        () => { /* counter is a nicety */ }
      );
    }
  } catch { /* never fail a reply over bookkeeping */ }
}

/**
 * Per-IP throttle for the AI path.
 *
 * Serverless means this is per container rather than global, so it is a speed
 * bump rather than a wall — the real ceiling is the daily budget below. Both
 * exist because the endpoint takes no login.
 */
const hits = new Map<string, number[]>();
export const AI_PER_IP_PER_HOUR = 8;

export function aiThrottled(ip: string): boolean {
  const now = Date.now();
  const hour = 3_600_000;
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < hour);
  if (recent.length >= AI_PER_IP_PER_HOUR) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < hour)) hits.delete(k);
  return false;
}

/** Today's AI answers across every visitor, so a bad day cannot run up a bill. */
export const AI_DAILY_BUDGET = Number(process.env.BOT_AI_DAILY_BUDGET || 300);

export async function aiBudgetSpent(): Promise<boolean> {
  try {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin()
      .from("bot_questions").select("id", { count: "exact", head: true })
      .eq("source", "ai").gte("created_at", since.toISOString());
    return (count ?? 0) >= AI_DAILY_BUDGET;
  } catch {
    // If the budget cannot be read, assume it is spent. Failing closed on a
    // public endpoint that costs money is the only safe direction.
    return true;
  }
}

/** The bot's instructions. Deliberately narrow: it sells the product, it is not the product. */
export function systemPrompt(siteName: string, answers: BotAnswer[]) {
  const known = answers
    .slice(0, 20)
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  return `You are the assistant on the ${siteName} marketing site, talking to someone who has not signed up yet.

${known ? `Here is what the team has already written. Prefer these answers, in this wording:\n\n${known}\n\n` : ""}What ${siteName} is: an AI study tool. A student uploads their own course material — PDFs, Word files, slides, photos of handwritten notes, lecture recordings — and it explains that material step by step, then turns it into study notes, mind maps, practice tests, slide decks, transcripts and translations. There is a free plan with daily limits and no card, and a paid Premium plan with much higher limits.

Rules:
- Two or three sentences. This is a chat bubble, not a page.
- Answer only about ${siteName}, studying with it, plans, privacy, or what it can read. Anything else: say it is not what you are here for, and offer to help with the product instead.
- Never invent a feature, a price, a number, or a policy. If you do not know, say so and point them to support.
- Do not do their homework here. That is what the product is for, after signing up.
- No markdown, no bullet lists, no links. Plain sentences.`;
}
