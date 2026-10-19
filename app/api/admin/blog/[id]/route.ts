import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { logAdmin } from "../../../../../lib/auth";
import { adminOrFail, body, str } from "../../_helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "blog");
  if (!gate.ok) return gate.res;
  const { id } = await params;

  const { data } = await supabaseAdmin().from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json({ post: data });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "blog");
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const b = await body(req);
  const db = supabaseAdmin();

  const { data: existing } = await db.from("blog_posts").select("id,slug,status,published_at").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.title === "string") patch.title = str(b.title, 160);
  if (typeof b.excerpt === "string") patch.excerpt = str(b.excerpt, 300);
  if (typeof b.content === "string") patch.content = b.content.slice(0, 100_000);
  if (typeof b.coverUrl === "string") patch.cover_url = str(b.coverUrl, 500);
  if (Array.isArray(b.tags)) patch.tags = (b.tags as unknown[]).map((t) => str(t, 30)).filter(Boolean).slice(0, 6);
  if (b.status === "draft" || b.status === "published") {
    patch.status = b.status;
    // stamp the publish date the first time it goes live, and keep it afterwards
    if (b.status === "published" && !existing.published_at) patch.published_at = new Date().toISOString();
  }

  const { error } = await db.from("blog_posts").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not save the post." }, { status: 500 });

  await logAdmin(gate.admin, "blog.update", existing.slug, { status: patch.status ?? existing.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "blog");
  if (!gate.ok) return gate.res;
  const { id } = await params;

  const db = supabaseAdmin();
  const { data: existing } = await db.from("blog_posts").select("slug").eq("id", id).maybeSingle();
  const { error } = await db.from("blog_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete the post." }, { status: 500 });

  await logAdmin(gate.admin, "blog.delete", existing?.slug ?? id);
  return NextResponse.json({ ok: true });
}
