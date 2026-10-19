import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { logAdmin } from "../../../../lib/auth";
import { adminOrFail, body, str } from "../_helpers";

export const dynamic = "force-dynamic";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 70) || "post";

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "blog");
  if (!gate.ok) return gate.res;

  const { data, error } = await supabaseAdmin()
    .from("blog_posts").select("id,slug,title,excerpt,status,tags,published_at,updated_at")
    .order("updated_at", { ascending: false }).limit(100);

  if (error) return NextResponse.json({ error: "Could not load posts." }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: Request) {
  const gate = await adminOrFail(req, "blog");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const title = str(b.title, 160);
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const db = supabaseAdmin();
  let slug = str(b.slug, 70) ? slugify(str(b.slug, 70)) : slugify(title);

  // keep slugs unique without failing the request
  const { data: taken } = await db.from("blog_posts").select("slug").like("slug", `${slug}%`);
  if ((taken ?? []).some((r) => r.slug === slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const status = b.status === "published" ? "published" : "draft";
  const { data, error } = await db.from("blog_posts").insert({
    slug, title,
    excerpt: str(b.excerpt, 300),
    content: typeof b.content === "string" ? b.content.slice(0, 100_000) : "",
    cover_url: str(b.coverUrl, 500),
    tags: Array.isArray(b.tags) ? (b.tags as unknown[]).map((t) => str(t, 30)).filter(Boolean).slice(0, 6) : [],
    status,
    author_name: str(b.authorName, 80) || gate.admin.user.email?.split("@")[0] || "Eluna Mind",
    published_at: status === "published" ? new Date().toISOString() : null,
  }).select("id,slug").single();

  if (error) {
    console.error("blog create failed:", error.message);
    return NextResponse.json({ error: "Could not create the post." }, { status: 500 });
  }

  await logAdmin(gate.admin, "blog.create", data.slug, { title });
  return NextResponse.json({ ok: true, post: data });
}
