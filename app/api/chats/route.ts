import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("chats").select("id,title,updated_at").eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "Could not load chats." }, { status: 500 });
  return NextResponse.json({ chats: data ?? [] });
}
