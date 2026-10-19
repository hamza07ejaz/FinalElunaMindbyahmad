import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  const { data } = await supabaseAdmin().from("notes_history").select("id,title,content,created_at")
    .eq("id", id).eq("user_id", auth.user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Note not found." }, { status: 404 });
  return NextResponse.json({ note: data });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin().from("notes_history").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
