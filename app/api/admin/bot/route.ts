import { NextResponse } from "next/server";
import { logAdmin } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail, body, str } from "../_helpers";

export const dynamic = "force-dynamic";

/** The bot's written answers, plus what visitors asked that nothing covered. */
export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const db = supabaseAdmin();
  const [answers, misses, counts] = await Promise.all([
    db.from("bot_answers").select("*").order("sort"),
    // The unanswered questions are the point of this screen: each one is a gap
    // in what the site explains.
    db.from("bot_questions").select("id,question,source,created_at")
      .in("source", ["none", "ai"]).order("created_at", { ascending: false }).limit(40),
    db.from("bot_questions").select("source"),
  ]);

  if (answers.error) {
    const missing = /does not exist|could not find/i.test(answers.error.message);
    return NextResponse.json({
      error: missing
        ? "The bot tables are not set up yet. Run supabase/009_site_content.sql, then reload."
        : "Could not load the bot.",
      setupNeeded: missing,
    }, { status: missing ? 503 : 500 });
  }

  const all = counts.data ?? [];
  return NextResponse.json({
    answers: answers.data ?? [],
    misses: misses.data ?? [],
    stats: {
      asked: all.length,
      answered: all.filter((q) => q.source === "answers").length,
      ai: all.filter((q) => q.source === "ai").length,
      unanswered: all.filter((q) => q.source === "none").length,
    },
  });
}

export async function POST(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const question = str(b.question, 200);
  const answer = str(b.answer, 1200);
  if (!question || !answer)
    return NextResponse.json({ error: "A question and an answer are both needed." }, { status: 400 });

  const { error } = await supabaseAdmin().from("bot_answers").insert({
    question, answer,
    keywords: str(b.keywords, 300),
    suggested: b.suggested === true,
    enabled: b.enabled !== false,
    sort: typeof b.sort === "number" ? Math.max(0, Math.round(b.sort)) : 100,
  });

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "There is already an answer with that question." }, { status: 409 });
    return NextResponse.json({ error: "Could not save the answer." }, { status: 500 });
  }

  await logAdmin(gate.admin, "bot.create", question.slice(0, 60));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const id = str(b.id, 60);
  if (!id) return NextResponse.json({ error: "Which answer?" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof b.question === "string" && b.question.trim()) patch.question = str(b.question, 200);
  if (typeof b.answer === "string" && b.answer.trim()) patch.answer = str(b.answer, 1200);
  if (typeof b.keywords === "string") patch.keywords = str(b.keywords, 300);
  if (typeof b.suggested === "boolean") patch.suggested = b.suggested;
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (typeof b.sort === "number" && Number.isFinite(b.sort)) patch.sort = Math.max(0, Math.round(b.sort));

  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await supabaseAdmin().from("bot_answers").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not save the answer." }, { status: 500 });

  await logAdmin(gate.admin, "bot.update", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const id = str(new URL(req.url).searchParams.get("id"), 60);
  if (!id) return NextResponse.json({ error: "Which answer?" }, { status: 400 });

  const { error } = await supabaseAdmin().from("bot_answers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete the answer." }, { status: 500 });

  await logAdmin(gate.admin, "bot.delete", id);
  return NextResponse.json({ ok: true });
}
