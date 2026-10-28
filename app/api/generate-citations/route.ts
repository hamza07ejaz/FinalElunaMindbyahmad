import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, extractJson, MODEL, readJson } from "../../../lib/ai";
import { CITATIONS_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";
import { plainDeep, plainText } from "../../../lib/plain";

// Vercel gives a function 10 seconds unless it is told otherwise, and an AI
// answer of any length takes longer than that. Without this line the request is
// killed mid-generation and the user sees a failure with nothing in the logs.
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guard(req, "citations");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const topic = clean(body.topic, g.rule.maxInputChars);
  const style = ["APA", "MLA", "Chicago"].includes(body.style) ? body.style : "APA";
  const count = Math.min(8, Math.max(5, Number(body.count) || 6));
  if (!topic) return NextResponse.json({ error: "Topic is required." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  const prompt = `Generate ${count} credible ${style} citations about "${topic}".
Return ONLY a JSON array of strings, each one a fully formatted citation.
No commentary, no extra keys, no markdown.
Prefer well-known books, journals and reputable sites.`;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: CITATIONS_SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    const arr = extractJson<string[]>(res.choices[0]?.message?.content || "", "array");
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("Invalid citations format");
    return NextResponse.json({
      citations: arr.slice(0, count).map((t) => ({ text: plainText(t, 500) })),
      disclaimer: "AI-generated citations can contain errors. Verify each source before using it.",
    });
  } catch (err) {
    console.error("citations error:", err);
    captureRouteError(err, req, { route: "/api/citations", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Failed to generate citations.") }, { status: 500 });
  }
}
