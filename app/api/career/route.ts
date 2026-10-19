import { NextResponse } from "next/server";
import { MODEL, aiErrorMessage, clean, complete, extractJson, readJson } from "../../../lib/ai";
import { guard } from "../../../lib/guard";
import { captureRouteError } from "../../../lib/errors";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import {
  MODES, UnusablePlanError, normalise, planTitle, planToText, promptFor,
  type Mode, type Plan,
} from "../../../lib/career";

// Vercel gives a function 10 seconds unless it is told otherwise, and a
// twelve-month plan is the longest answer this app generates.
export const maxDuration = 60;

/**
 * Career guidance.
 *
 * The previous version of this route shipped hardcoded "advice" — a generic six
 * step list and three stock career suggestions — that it served whenever the AI
 * call failed, while refunding the allowance. A student could not tell the
 * difference, so they received boilerplate presented as guidance about their own
 * answers. That has been removed: if the AI cannot answer, the route says so.
 *
 * Everything else is structured JSON now, normalised in lib/career.ts, so the
 * page lays out fields instead of splitting prose on a regular expression.
 */

const SYSTEM = `You are a careers adviser with twenty years of experience across several industries, talking to one student. You have seen people succeed and fail on every path you describe, and you say both.

You are not a brochure. You never oversell a career, never use corporate filler, and you never pretend a figure is more certain than it is. When a student's plan does not add up — they want a six-figure salary in a year with no training — you say so kindly and give them what is actually achievable.

You return only JSON, in exactly the shape you are given.`;

export async function POST(req: Request) {
  const g = await guard(req, "career");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const mode: Mode = MODES.includes(body.mode) ? body.mode : "explore";

  if (mode === "followup") return followup(req, g, body);

  const role = clean(body.role, 120);
  const skills = clean(body.skills, 300);
  const region = clean(body.region, 80);
  const answers = sanitiseAnswers(body.answers);

  if ((mode === "roadmap" || mode === "reality") && role.length < 2)
    return NextResponse.json({ error: "Type the career you want to look at." }, { status: 400 });
  if ((mode === "explore" || mode === "income") && Object.keys(answers).length < 2)
    return NextResponse.json({ error: "Answer the questions first so the advice is about you." }, { status: 400 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const plan = await generate(mode, { role, answers, skills, region }, g.rule.maxTokens);

    // Saved so a student can come back to it and ask questions about it. Best
    // effort: the plan is the product, the history is a convenience.
    let id: string | null = null;
    try {
      const { data } = await supabaseAdmin().from("career_plans").insert({
        user_id: g.auth.user.id,
        mode,
        role: role || null,
        title: planTitle(mode, plan, role),
        plan,
      }).select("id").single();
      id = (data?.id as string) ?? null;
    } catch (e) {
      console.error("career plan save failed:", (e as Error)?.message);
    }

    return NextResponse.json({ plan, id, text: planToText(plan) });
  } catch (err) {
    console.error("career error:", err);
    captureRouteError(err, req, { route: "/api/career", status: 500 });
    await g.refund();
    const unusable = err instanceof UnusablePlanError;
    return NextResponse.json({
      error: unusable
        // Distinct from a provider failure: retrying this one usually works.
        ? "The answer came back incomplete. Press the button again — your allowance was not used."
        : aiErrorMessage(err, "Could not build your career guidance. Please try again."),
    }, { status: 502 });
  }
}

/**
 * Generate and parse, with one retry.
 *
 * A model occasionally returns prose where JSON was asked for, or drops the one
 * array the page needs. Asking again, more firmly, fixes it far more often than
 * it fails twice — and a second attempt is much cheaper than making the student
 * spend another allowance.
 */
async function generate(
  mode: Mode,
  input: { role: string; answers: Record<string, string>; skills: string; region: string },
  maxTokens: number,
): Promise<Plan> {
  const prompt = promptFor(mode, input);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await complete({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: attempt === 0 ? 0.7 : 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: attempt === 0 ? prompt : `${prompt}\n\nYour previous answer could not be read. Return ONLY the JSON object, starting with { and ending with }. Every field in the shape above must be present.` },
      ],
    });

    const text = res.choices?.[0]?.message?.content ?? "";
    try {
      const raw = extractJson<Record<string, unknown>>(text, "object");
      if (!raw) throw new UnusablePlanError(mode);
      return normalise(mode, raw);
    } catch (err) {
      lastError = err;
      console.error(`career ${mode} parse failed (attempt ${attempt + 1}):`, (err as Error)?.message);
    }
  }

  throw lastError ?? new UnusablePlanError(mode);
}

/** A question about a plan the student already has in front of them. */
async function followup(req: Request, g: Extract<Awaited<ReturnType<typeof guard>>, { ok: true }>, body: any) {
  const planId = clean(body.planId, 60);
  const question = clean(body.question, 500);
  if (!question) return NextResponse.json({ error: "Type your question." }, { status: 400 });

  let context = clean(body.context, 8000);
  if (planId && !context) {
    const { data } = await supabaseAdmin()
      .from("career_plans").select("plan,mode").eq("id", planId).eq("user_id", g.auth.user.id).maybeSingle();
    if (data?.plan) context = planToText(data.plan as Plan).slice(0, 8000);
  }
  if (!context) return NextResponse.json({ error: "That plan is no longer available. Generate a new one." }, { status: 404 });

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    const res = await complete({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.6,
      messages: [
        { role: "system", content: `${SYSTEM}\n\nFor this question answer in short markdown, not JSON. Two or three paragraphs at most, or a short list. Answer only what was asked. Never give a URL — name the provider and what to search for. Keep any pay figure as a range with its region, and say it is an estimate.` },
        { role: "system", content: `This is the plan the student is looking at:\n\n${context}` },
        { role: "user", content: question },
      ],
    });
    const answer = (res.choices?.[0]?.message?.content ?? "").trim();
    if (!answer) throw new Error("Empty AI response");
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("career followup error:", err);
    captureRouteError(err, req, { route: "/api/career", status: 502 });
    await g.refund();
    return NextResponse.json({ error: aiErrorMessage(err, "Could not answer that right now. Please try again.") }, { status: 502 });
  }
}

/** The questionnaire answers, trimmed and capped so one long paste cannot flood the prompt. */
function sanitiseAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    const key = clean(k, 120);
    const val = clean(v, 200);
    if (key && val) out[key] = val;
  }
  return out;
}

/** The student's saved plans. */
export async function GET(req: Request) {
  const g = await guard(req, "career");
  if (!g.ok) return g.res;

  const id = clean(new URL(req.url).searchParams.get("id"), 60);
  try {
    const db = supabaseAdmin();
    if (id) {
      const { data } = await db
        .from("career_plans").select("id,mode,role,title,plan,created_at")
        .eq("id", id).eq("user_id", g.auth.user.id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
      return NextResponse.json({ plan: data.plan, id: data.id, mode: data.mode, text: planToText(data.plan as Plan) });
    }
    const { data } = await db
      .from("career_plans").select("id,mode,role,title,created_at")
      .eq("user_id", g.auth.user.id).order("created_at", { ascending: false }).limit(20);
    return NextResponse.json({ plans: data ?? [] });
  } catch {
    // The table may not exist yet; an empty history is the right answer.
    return NextResponse.json({ plans: [] });
  }
}

export async function DELETE(req: Request) {
  const g = await guard(req, "career");
  if (!g.ok) return g.res;
  const id = clean(new URL(req.url).searchParams.get("id"), 60);
  if (!id) return NextResponse.json({ error: "Which plan?" }, { status: 400 });
  await supabaseAdmin().from("career_plans").delete().eq("id", id).eq("user_id", g.auth.user.id);
  return NextResponse.json({ ok: true });
}
