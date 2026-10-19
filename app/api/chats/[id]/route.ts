import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: chat } = await db.from("chats").select("id,title").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!chat) return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  // The joined upload lets a reopened chat still show which file a question was
  // about. On a database where migration 006 has not been run the column does
  // not exist, so fall back to the plain history rather than failing the page.
  const joined = await db.from("chat_messages")
    .select("id,role,content,created_at,uploads(file_name)")
    .eq("chat_id", id).order("created_at", { ascending: true }).limit(500);

  if (joined.error) {
    console.error("chat history join unavailable:", joined.error.message);
    const { data } = await db.from("chat_messages").select("id,role,content,created_at")
      .eq("chat_id", id).order("created_at", { ascending: true }).limit(500);
    return NextResponse.json({ chat, messages: data ?? [] });
  }

  const messages = (joined.data ?? []).map((m) => {
    const up = m.uploads as { file_name: string } | { file_name: string }[] | null;
    const file = Array.isArray(up) ? up[0]?.file_name : up?.file_name;
    return { id: m.id, role: m.role, content: m.content, created_at: m.created_at, file: file ?? null };
  });
  return NextResponse.json({ chat, messages });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin().from("chats").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
