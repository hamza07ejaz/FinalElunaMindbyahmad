import { NextResponse } from "next/server";
import { aiErrorMessage, clean, complete, MODEL, readJson } from "../../../lib/ai";
import { STUDY_PLAN_SYSTEM } from "../../../lib/prompts";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";

// Vercel gives a function 10 seconds unless it is told otherwise, and an AI
// answer of any length takes longer than that. Without this line the request is
// killed mid-generation and the user sees a failure with nothing in the logs.
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guard(req, "studyPlan");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const subject = clean(body.subject, g.rule.maxInputChars);
  const days = Math.min(60, Math.max(1, Math.round(Number(body.examDate) || 0)));
  const hours = Math.min(16, Math.max(0.5, Number(body.hoursPerDay) || 2));
  if (!subject || !Number(body.examDate))
    return NextResponse.json({ error: "Please enter a subject and number of days." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  const prompt = `
You are an AI study planner. Create a detailed, structured ${days}-day study plan for the topic "${subject}".
The student has ${hours} hours per day to study.
The plan should include daily goals, specific topics, review days, and short motivational reminders.
Format it neatly and clearly with "Day 1", "Day 2", etc. as headings and bullet points under each.
Make it motivational but realistic.`;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      temperature: 0.7,
      messages: [
        { role: "system", content: STUDY_PLAN_SYSTEM },
        { role: "user", content: prompt },
      ],
    });
    const plan = res.choices[0]?.message?.content;
    if (!plan) throw new Error("Empty AI response");
    return NextResponse.json({ plan });
  } catch (err) {
    console.error("study-plan error:", err);
    captureRouteError(err, req, { route: "/api/study-plan", status: 500 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Failed to generate the plan.") }, { status: 500 });
  }
}
