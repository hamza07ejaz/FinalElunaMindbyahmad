import { NextResponse } from "next/server";
import { MODEL, complete } from "../../../lib/ai";
import {
  AI_PER_IP_PER_HOUR, MAX_QUESTION, aiBudgetSpent, aiThrottled, bestMatch,
  loadAnswers, logQuestion, systemPrompt,
} from "../../../lib/bot";
import { captureRouteError } from "../../../lib/errors";
import { getSettings } from "../../../lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The landing bot.
 *
 * This endpoint takes no login, so every answer is either free (written by the
 * admin) or spent against a hard cap. The order is deliberate: written answers,
 * then AI, then an honest "ask me inside".
 */

/** The starter chips, and whether the AI leg is live. */
export async function GET() {
  const [{ site }, answers] = await Promise.all([getSettings(), loadAnswers()]);
  return NextResponse.json({
    name: site.bot.name,
    greeting: site.bot.greeting,
    suggestions: answers.filter((a) => a.suggested).slice(0, 4).map((a) => a.question),
  });
}

/** The visitor's IP, whichever host we are on. Each platform names it differently. */
function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (
    fwd.split(",")[0] ||
    req.headers.get("x-real-ip") ||                   // Vercel
    req.headers.get("x-nf-client-connection-ip") ||   // Netlify
    "unknown"
  ).trim();
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* handled below */ }

  const question = typeof body.question === "string" ? body.question.trim().slice(0, MAX_QUESTION) : "";
  if (question.length < 2)
    return NextResponse.json({ error: "Ask me something first." }, { status: 400 });

  const [{ site, branding }, answers] = await Promise.all([getSettings(), loadAnswers()]);

  // 1. Something the team already wrote.
  const match = bestMatch(question, answers);
  if (match) {
    void logQuestion(question, match.answer.id, "answers");
    return NextResponse.json({ reply: match.answer.answer, source: "answers" });
  }

  // 2. The AI, if it is switched on and there is budget left.
  if (site.bot.aiEnabled) {
    if (aiThrottled(clientIp(req))) {
      void logQuestion(question, null, "none");
      return NextResponse.json({
        reply: `That is more questions than I can take from one visitor in an hour. ${site.bot.fallback}`,
        source: "limit",
      });
    }

    if (await aiBudgetSpent()) {
      void logQuestion(question, null, "none");
      return NextResponse.json({ reply: site.bot.fallback, source: "limit" });
    }

    try {
      const res = await complete({
        model: MODEL,
        max_tokens: 220,          // a chat bubble, not an essay
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt(branding.siteName, answers) },
          { role: "user", content: question },
        ],
      });
      const reply = res.choices[0]?.message?.content?.trim();
      if (reply) {
        void logQuestion(question, null, "ai");
        return NextResponse.json({ reply, source: "ai" });
      }
    } catch (err) {
      console.error("bot ai failed:", (err as Error)?.message);
      captureRouteError(err, req, { level: "warn", route: "/api/bot", status: 502 });
      // Falls through to the written fallback below: a visitor should never see
      // an error from a chat bubble.
    }
  }

  // 3. The honest answer.
  void logQuestion(question, null, "none");
  return NextResponse.json({ reply: site.bot.fallback, source: "none" });
}

export const RATE_NOTE = `AI answers are capped at ${AI_PER_IP_PER_HOUR} per visitor per hour.`;
