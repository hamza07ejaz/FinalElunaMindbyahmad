import { NextResponse } from "next/server";
import { MODEL, clean, complete, explain, readJson, streamComplete } from "../../../lib/ai";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { contextFromUpload, getOwnedUpload } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";
import { chatStream } from "../../../lib/chat-stream";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You are Eluna, a sharp and friendly AI study tutor inside the Eluna Mind app.

How to answer
- Lead with the answer or the first step. No "Great question!", no restating what was asked, no summary of what you are about to do.
- Teach in order: what it is, why it works, then a worked example with real numbers.
- Show every step of a calculation or derivation. Never jump from the question to the result.
- Keep paragraphs to two or three sentences. Break anything longer into bullets or numbered steps.
- **Bold** the terms a student would be tested on. Use ## headings only when the answer has three or more distinct parts.
- End a substantial answer with one line that either checks understanding or names the next thing to learn. Skip it on short answers.

Formatting rules
- Every formula, equation, variable or symbol goes in LaTeX: $x^2$ inline, $$...$$ on its own line. Never write maths as plain text like "x^2", "sqrt(x)" or "x_1".
- Code goes in fenced blocks with the language, like \`\`\`python.
- Use a markdown table when comparing three or more things.

Honesty
- Reply in the same language the student writes in.
- If a question is unclear, make the most sensible assumption, say which one you made, and answer. Only ask a question back when the answer would otherwise be useless.
- For homework, work through the method with the student rather than handing over only the final answer.
- Say plainly when you are not sure. Never invent facts, sources, quotes or numbers.`;

export async function POST(req: Request) {
  const g = await guard(req, "chat");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const message = clean(body.message, g.rule.maxInputChars);
  if (!message) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });

  const db = supabaseAdmin();
  const userId = g.auth.user.id;
  let chatId: string | null = typeof body.chatId === "string" ? body.chatId : null;

  if (chatId) {
    const { data: own } = await db.from("chats").select("id").eq("id", chatId).eq("user_id", userId).maybeSingle();
    if (!own) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  // An attached file: its text joins the prompt as context, not as the question.
  const uploadId = typeof body.uploadId === "string" ? body.uploadId : null;
  let fileContext = "";
  let fileName = "";
  if (uploadId) {
    const up = await getOwnedUpload(userId, uploadId);
    if (!up) return NextResponse.json({ error: "That file is no longer available." }, { status: 404 });
    if (up.status !== "ready")
      return NextResponse.json({ error: "That file is still being read. Give it a moment and try again." }, { status: 409 });
    fileContext = contextFromUpload(up);
    fileName = up.file_name;
    if (!fileContext)
      return NextResponse.json({
        error: up.kind === "audio"
          // An uploaded recording has no text until the transcript tool has run.
          ? "Recordings need transcribing first. Open Lecture Transcripts, run this file, and then ask about it here."
          : "No readable text was found in that file, so I cannot answer about it.",
      }, { status: 422 });
  }

  const blocked = await g.consume();
  if (blocked) return blocked;

  try {
    if (!chatId) {
      const title = (fileName ? `${fileName} — ${message}` : message).replace(/\s+/g, " ").slice(0, 60);
      const { data, error } = await db.from("chats").insert({ user_id: userId, title }).select("id").single();
      if (error || !data) throw new Error(error?.message || "Could not create chat");
      chatId = data.id as string;
    }

    const { data: hist } = await db
      .from("chat_messages").select("role,content").eq("chat_id", chatId)
      .order("created_at", { ascending: false }).limit(12);
    const history = (hist ?? []).reverse() as { role: "user" | "assistant"; content: string }[];

    // upload_id is only sent when a file is attached, so chat keeps working on a
    // database where migration 006 has not been run yet.
    await db.from("chat_messages").insert({
      chat_id: chatId, user_id: userId, role: "user", content: message,
      ...(uploadId ? { upload_id: uploadId } : {}),
    });

    const payload = {
      model: MODEL,
      max_tokens: g.rule.maxTokens,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM },
        ...history,
        // Last, so the file is the freshest thing in context when the question is about it.
        ...(fileContext ? [{ role: "system" as const, content: fileContext }] : []),
        { role: "user", content: message },
      ],
    };

    // Throws if no provider manages to say a single word, which is handled by the
    // catch below as a clean JSON error instead of an empty stream.
    const handle = await streamComplete(payload);

    const cid = chatId;

    const rs = chatStream({
      chunks: handle.chunks,
      abort: () => handle.abort(),
      retry: async () => {
        const res = await complete(payload);
        return res?.choices?.[0]?.message?.content ?? "";
      },
      refund: () => g.refund(),
      save: async (answer) => {
        await db.from("chat_messages").insert({ chat_id: cid, user_id: userId, role: "assistant", content: answer });
        await db.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", cid);
      },
      onError: (err, stage) => {
        console.error(`chat ${stage} failed:`, explain(err));
        // Only a total failure is worth an error-dashboard entry: a stream that
        // died after most of the answer is noise there.
        if (stage !== "save") captureRouteError(err, req, { route: "/api/chat", status: 502 });
      },
    });

    return new Response(rs, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Chat-Id": cid,
      },
    });
  } catch (err) {
    console.error("chat error:", explain(err));
    captureRouteError(err, req, { route: "/api/chat", status: 500 });
    await g.refund();
    // The admin reason goes to the error dashboard, not to the student: they can
    // act on "try again", not on a base URL. The one exception is nothing being
    // set up at all, which is worth saying out loud on a demo.
    const unconfigured = /no ai provider is configured/i.test((err as Error)?.message ?? "");
    return NextResponse.json({
      error: unconfigured
        ? "No AI key is set up yet. An admin needs to add one under Admin → AI keys."
        : "The AI did not answer in time. Your message was not counted — please try again.",
    }, { status: 503 });
  }
}
