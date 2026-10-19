import { NextResponse } from "next/server";
import { logAdmin } from "../../../../lib/auth";
import { REQUIRED_SLUGS, STARTER_BODIES, listAllPages } from "../../../../lib/pages";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail, body, str } from "../_helpers";

export const dynamic = "force-dynamic";

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/** Slugs that belong to real routes and must not be shadowed by a content page. */
const RESERVED = new Set([
  "api", "admin", "dashboard", "login", "logout", "auth", "blog", "pricing", "help", "menu",
  "about", "success", "suspended", "forgot", "reset", "diagnose", "checkout", "career",
  "citations", "flashcards", "grammar", "paraphrase", "presentation", "qna", "study-plan",
  "test", "visual-map", "notes", "chat", "transcript", "translate", "files", "support",
]);

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  try {
    const pages = await listAllPages();
    return NextResponse.json({
      pages,
      starters: STARTER_BODIES,
      required: REQUIRED_SLUGS,
    });
  } catch (err) {
    const message = (err as Error)?.message ?? "";
    const missing = /does not exist|could not find/i.test(message);
    return NextResponse.json({
      error: missing
        ? "The pages table is not set up yet. Run supabase/009_site_content.sql, then reload."
        : "Could not load the pages.",
      setupNeeded: missing,
    }, { status: missing ? 503 : 500 });
  }
}

/** Create a page. */
export async function POST(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const title = str(b.title, 90);
  if (!title) return NextResponse.json({ error: "Give the page a title." }, { status: 400 });

  const slug = slugify(str(b.slug, 60) || title);
  if (!slug) return NextResponse.json({ error: "That title does not make a usable web address." }, { status: 400 });
  if (RESERVED.has(slug))
    return NextResponse.json({ error: `"${slug}" is already a page on the site. Pick another address.` }, { status: 409 });

  const { error } = await supabaseAdmin().from("site_pages").insert({
    slug, title, body: str(b.body, 80_000), published: b.published !== false, sort: 100,
  });
  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "A page already uses that address." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the page." }, { status: 500 });
  }

  await logAdmin(gate.admin, "page.create", slug);
  return NextResponse.json({ ok: true, slug });
}

/** Edit or publish/unpublish a page. */
export async function PATCH(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const slug = str(b.slug, 60);
  if (!slug) return NextResponse.json({ error: "Which page?" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: gate.admin.user.id };
  const done: string[] = [];

  if (typeof b.title === "string" && b.title.trim()) { patch.title = str(b.title, 90); done.push("title"); }
  // An empty body is allowed: it falls back to the starter text when rendered,
  // which is how an admin resets a page they have mangled.
  if (typeof b.body === "string") { patch.body = str(b.body, 80_000); done.push("body"); }
  if (typeof b.published === "boolean") { patch.published = b.published; done.push(b.published ? "published" : "hidden"); }
  if (typeof b.sort === "number" && Number.isFinite(b.sort)) { patch.sort = Math.max(0, Math.round(b.sort)); done.push("order"); }

  if (!done.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await supabaseAdmin().from("site_pages").update(patch).eq("slug", slug);
  if (error) return NextResponse.json({ error: "Could not save the page." }, { status: 500 });

  await logAdmin(gate.admin, "page.update", slug, { changes: done });
  return NextResponse.json({ ok: true, changed: done });
}

/** Delete a page the admin added. The four the footer links to cannot be deleted. */
export async function DELETE(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const slug = str(new URL(req.url).searchParams.get("slug"), 60);
  if (!slug) return NextResponse.json({ error: "Which page?" }, { status: 400 });
  if ((REQUIRED_SLUGS as readonly string[]).includes(slug))
    return NextResponse.json(
      { error: "This page is linked from the footer and from checkout. You can hide it, but not delete it." },
      { status: 400 }
    );

  const { error } = await supabaseAdmin().from("site_pages").delete().eq("slug", slug).eq("required", false);
  if (error) return NextResponse.json({ error: "Could not delete the page." }, { status: 500 });

  await logAdmin(gate.admin, "page.delete", slug);
  return NextResponse.json({ ok: true });
}
