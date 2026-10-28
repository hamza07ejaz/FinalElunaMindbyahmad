import { NextResponse } from "next/server";
import { MODEL, clean, complete, readJson } from "../../../lib/ai";
import { PARAPHRASE_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";
import { plainDeep, plainText } from "../../../lib/plain";

// Vercel gives a function 10 seconds unless it is told otherwise, and an AI
// answer of any length takes longer than that. Without this line the request is
// killed mid-generation and the user sees a failure with nothing in the logs.
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guard(req, "paraphrase");
  if (!g.ok) {
    const j = await g.res.json();
    return NextResponse.json({ paraphrased: j.error, ...j }, { status: g.res.status });
  }

  const body = await readJson(req);
  const text = clean(body.text, g.rule.maxInputChars);
  if (!text) return NextResponse.json({ paraphrased: "No text provided." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) {
    const j = await blocked.json();
    return NextResponse.json({ paraphrased: j.error, ...j }, { status: blocked.status });
  }

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      messages: [
        { role: "system", content: PARAPHRASE_SYSTEM },
        { role: "user",
        content: `Paraphrase the following text in clear, natural, and professional English.\nKeep the same meaning but make it smoother and more concise:\n"${text}"`,
      }],
    });
    const paraphrased = res.choices[0]?.message?.content?.trim();
    if (!paraphrased) throw new Error("Empty AI response");
    // A rewrite can be long, so the cap is generous; the point here is only
    // to remove markup the plain-text view would print literally.
    return NextResponse.json({ paraphrased: plainText(paraphrased, 20000) });
  } catch (err) {
    console.error("paraphrase error:", err);
    captureRouteError(err, req, { route: "/api/paraphrase", status: 500 });
    await g.refund();
    return NextResponse.json({ paraphrased: "Error generating paraphrased text." }, { status: 500 });
  }
}
