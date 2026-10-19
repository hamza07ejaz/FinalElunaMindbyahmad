import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, extractJson, MODEL, readJson } from "../../../lib/ai";
import { PRESENTATION_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";

export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guard(req, "presentation"); // the plan comes from the database, never the request body
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const topic = clean(body.topic, g.rule.maxInputChars);
  const slideCount = Math.min(12, Math.max(5, Math.round(Number(body.slides) || 10)));
  const audience = clean(body.audience, 60) || "students";
  if (!topic) return NextResponse.json({ error: "Topic is required." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  const prompt = `Write a ${slideCount}-slide presentation on "${topic}" for ${audience}.

Rules for the deck:
- Slide 1 is the title slide: the title is the topic itself, and its 3 bullets are a short subtitle split into three phrases.
- Every other slide covers ONE idea, with a specific, informative title (not "Introduction" or "Overview").
- 3 to 5 bullets per slide. Each bullet is a complete, concrete thought of 6 to 14 words.
- Use real facts, numbers, causes and effects, definitions and examples. No filler like "Key points" or "More details".
- Build an argument across the deck: context, then mechanism, then evidence, then implications.
- The last slide is "What to remember", with the 3 or 4 things worth keeping.
- Plain text only. No markdown symbols, no emoji, no numbering inside the text.
- Speaker notes: 2 or 3 sentences a presenter could actually say, adding something not already on the slide.

Return JSON exactly like:
{"slides":[{"title":"...","bullets":["...","..."],"notes":"..."}]}`;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PRESENTATION_SYSTEM },
        { role: "user", content: prompt },
      ],
    });

    const json = extractJson<{ slides: unknown }>(res.choices[0]?.message?.content || "", "object");
    if (!json || !Array.isArray(json.slides) || json.slides.length === 0) throw new Error("Invalid slides");

    const slides = (json.slides as Record<string, unknown>[])
      .slice(0, 15)
      .map((s) => ({
        title: String(s?.title ?? "Slide").slice(0, 120),
        bullets: Array.isArray(s?.bullets)
          ? (s.bullets as unknown[]).map((b) => String(b).replace(/^[-•*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 6)
          : [],
        notes: s?.notes ? String(s.notes).slice(0, 600) : "",
      }))
      .filter((s) => s.title || s.bullets.length);

    if (!slides.length) throw new Error("Empty deck");
    return NextResponse.json({ slides });
  } catch (err) {
    console.error("presentation error:", err);
    captureRouteError(err, req, { route: "/api/presentation", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Could not build the presentation. Please try again.") }, { status: 500 });
  }
}
