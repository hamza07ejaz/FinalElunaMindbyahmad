import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { BUCKET, getOwnedUpload } from "../../../../lib/uploads";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;
  const up = await getOwnedUpload(auth.user.id, id);
  if (!up) return NextResponse.json({ error: "File not found." }, { status: 404 });
  return NextResponse.json({
    id: up.id, name: up.file_name, kind: up.kind, status: up.status,
    pages: up.pages, text: up.extracted_text ?? "",
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;

  const db = supabaseAdmin();
  const up = await getOwnedUpload(auth.user.id, id);
  if (!up) return NextResponse.json({ error: "File not found." }, { status: 404 });

  if (up.storage_path && up.storage_path !== "pending") {
    await db.storage.from(BUCKET).remove([up.storage_path]).catch(() => {});
  }
  const { error } = await db.from("uploads").delete().eq("id", id).eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: "Could not delete the file." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
