import { NextResponse } from "next/server";
import { MODEL, aiErrorMessage, clean, complete, readJson } from "../../../lib/ai";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";
import { analyse, notes, compare, TIRED_PHRASES } from "../../../lib/readability";
import { changedShare, diffWords } from "../../../lib/diff";
import { supabaseAdmin } from "../../../lib/supabase/admin";

// Vercel gives a function 10 seconds unless it is told otherwise, and a rewrite
// of a full essay takes longer than that.
export const maxDuration = 60;

/**
 * Rewriting, with the result measured rather than described.
 *
 * What this is NOT: a way past an AI detector. Those tools do not work for long
 * — detectors change monthly — and a study platform that advertises one cannot
 * be sold to a school. What it is instead: the writing habits that make a draft
 * read as machine-written are well known and worth fixing on their own, and a
 * student's own voice is something a model can match if you show it a sample.
 *
 * Every number returned comes from lib/readability.ts, in code. Asking the model
 * to grade its own output gives a figure that changes when you ask twice.
 */

type Mode = "natural" | "voice" | "simpler" | "formal" | "shorter";

const MODES: Record<Mode, { label: string; brief: string }> = {
  natural: {
    label: "Sound natural",
    brief: `Rewrite it so it reads like a person wrote it in one sitting.
- Vary the sentence length deliberately. A short sentence after a long one is what gives a page a pulse.
- Cut the stock phrases listed below and say the thing directly instead.
- Prefer the active voice: name who did what.
- Delete hedges that carry no meaning: very, really, basically, simply, essentially.
- Use ordinary words where a long one adds nothing — "use" not "utilise", "about" not "regarding".
- Keep one or two slightly uneven turns of phrase. Perfectly smooth prose is what reads as machine-written.`,
  },
  voice: {
    label: "In my voice",
    brief: `Rewrite it in the student's own writing voice, matched from the sample provided.
- Match their sentence length and how much it varies, their vocabulary level, their punctuation habits, their use of contractions, and whether they write in first person.
- Match their level of formality exactly, even if it is less polished than you would write.
- Do not raise the vocabulary above the sample. If they write plainly, write plainly.
- Keep every fact, figure, name and conclusion from the original text unchanged.`,
  },
  simpler: {
    label: "Simpler",
    brief: `Rewrite it so a reader two or three school years younger can follow it.
- Shorter sentences, one idea each.
- Replace jargon with plain words, but keep any technical term the student has to learn — define it in a few words the first time instead of removing it.
- Keep every fact and figure. Simpler does not mean vaguer.`,
  },
  formal: {
    label: "More formal",
    brief: `Rewrite it for an academic reader.
- Precise word choice, no contractions, no slang, no exclamation marks.
- Still direct: formal does not mean padded, and the stock phrases below are exactly what makes academic writing worse.
- Keep the active voice where the subject is known.`,
  },
  shorter: {
    label: "Shorter",
    brief: `Cut it down to roughly two thirds of its length with nothing important lost.
- Delete repetition, restatement and anything that only restates the heading.
- Keep every fact, figure, name and conclusion.
- Merge sentences that make the same point.`,
  },
};

const PHRASE_LIST = TIRED_PHRASES.map((p) => `"${p.phrase}" → ${p.instead}`).join("\n");

const SYSTEM = `You rewrite a student's own writing so that it reads better. You are not writing it for them: the ideas, facts, figures, argument and conclusions are theirs and must survive the rewrite unchanged.

Hard rules:
- Output the rewritten text ONLY. No preamble, no "here is the rewritten version", no notes, no explanation of your changes.
- Keep the original language. If the text is in Urdu, rewrite in Urdu.
- Keep every number, date, name, quotation and citation exactly as given. Never add a fact, source or statistic that is not already there.
- Keep the markdown structure: headings stay headings, lists stay lists, paragraph breaks stay where they are.
- If the text is already good, change little and return it nearly as it was. Do not rewrite for the sake of it.

Phrases to avoid, with what to use instead:
${PHRASE_LIST}`;

export async function POST(req: Request) {
  const g = await guard(req, "humanize");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const mode: Mode = (["natural", "voice", "simpler", "formal", "shorter"] as const).includes(body.mode)
    ? body.mode : "natural";
  const text = clean(body.text, g.rule.maxInputChars);
  // A sample needs to be long enough to show a pattern; below ~120 words the
  // model is matching noise and the result is worse than not trying.
  const sample = clean(body.sample, 4000);

  if (!text) return NextResponse.json({ error: "Paste the text you want rewritten." }, { status: 400 });
  if (text.split(/\s+/).length < 15)
    return NextResponse.json({ error: "That is too short to rewrite usefully — paste at least a couple of sentences." }, { status: 400 });
  if (mode === "voice" && sample.split(/\s+/).filter(Boolean).length < 100)
    return NextResponse.json({
      error: "To match your voice I need a sample of your own writing — at least 100 words of something you wrote yourself, with no AI help.",
      needSample: true,
    }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      // Low, not zero: a rewrite at zero temperature returns the same stiff
      // rhythm it was given, which is the one thing being asked to change.
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM },
        ...(mode === "voice"
          ? [{
              role: "system" as const,
              content: `This is a sample of the student's own writing. Match its voice. Do not copy its content.\n\n---\n${sample}\n---`,
            }]
          : []),
        { role: "user", content: `${MODES[mode].brief}\n\nRewrite this:\n\n${text}` },
      ],
    });

    const rewritten = (res.choices?.[0]?.message?.content ?? "")
      // Models like to announce themselves despite being told not to.
      .replace(/^\s*(?:here(?:'s| is)[^\n:]*:?|rewritten(?: version)?:?|sure[,!][^\n]*)\s*/i, "")
      .trim();

    if (!rewritten) throw new Error("Empty AI response");

    const before = analyse(text);
    const after = analyse(rewritten);
    const pieces = diffWords(text, rewritten);

    // Best effort, and quietly: the rewrite is the product, the history is a nicety.
    if (mode === "voice" && sample) {
      try {
        await supabaseAdmin().from("voice_samples").upsert(
          { user_id: g.auth.user.id, sample, words: sample.split(/\s+/).filter(Boolean).length },
          { onConflict: "user_id" },
        );
      } catch (e) {
        console.error("voice sample save failed:", (e as Error)?.message);
      }
    }

    return NextResponse.json({
      rewritten,
      mode,
      modeLabel: MODES[mode].label,
      before,
      after,
      change: compare(before, after),
      beforeNotes: notes(before),
      afterNotes: notes(after),
      diff: pieces,
      changedShare: changedShare(pieces),
    });
  } catch (err) {
    console.error("humanize error:", err);
    captureRouteError(err, req, { route: "/api/humanize", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "The rewrite failed. Please try again.") }, { status: 500 });
  }
}

/** The saved writing sample, so the form can be pre-filled on a return visit. */
export async function GET(req: Request) {
  const g = await guard(req, "humanize");
  if (!g.ok) return g.res;
  try {
    const { data } = await supabaseAdmin()
      .from("voice_samples").select("sample,words,updated_at").eq("user_id", g.auth.user.id).maybeSingle();
    return NextResponse.json({ sample: data?.sample ?? "", words: data?.words ?? 0, savedAt: data?.updated_at ?? null });
  } catch {
    // The table may not exist yet. An empty form is the right fallback.
    return NextResponse.json({ sample: "", words: 0, savedAt: null });
  }
}

/** Measure text without spending an allowance, for the live "before" panel. */
export async function PUT(req: Request) {
  const g = await guard(req, "humanize");
  if (!g.ok) return g.res;
  const body = await readJson(req);
  const text = clean(body.text, g.rule.maxInputChars);
  const report = analyse(text);
  return NextResponse.json({ report, notes: notes(report) });
}
