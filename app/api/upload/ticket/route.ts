import { NextResponse } from "next/server";
import { guard } from "../../../../lib/guard";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { BUCKET, storagePath } from "../../../../lib/uploads";
import { checkFile, safeFileName } from "../../../../lib/upload-core";
import { readJson } from "../../../../lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Permission to upload one file, straight to storage.
 *
 * The platform refuses any request body over a few megabytes — it never
 * reaches the application, so the app cannot explain it and the browser gets
 * the platform's own error page instead of JSON. Every lecture recording and
 * most real PDFs are over that line, which is why uploading them failed with
 * a message that said nothing.
 *
 * So the file does not travel through the app at all. This hands back a signed
 * URL that lets the browser put the file into storage directly, and the app
 * reads it back from there afterwards. Storage has no such limit, and the
 * bytes never occupy a function.
 *
 * What is checked here is everything that can be known before the file is
 * sent: the type, the size the browser claims, and the daily allowance. The
 * claims are checked again against the real object once it has arrived,
 * because nothing a browser says about a file is evidence.
 */
export async function POST(req: Request) {
  const g = await guard(req, "upload");
  if (!g.ok) return g.res;

  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name : "";
  const mime = typeof body.type === "string" ? body.type : "";
  const size = Number(body.size);

  if (!name) return NextResponse.json({ error: "No file was named." }, { status: 400 });
  if (!Number.isFinite(size) || size < 0)
    return NextResponse.json({ error: "That file's size could not be read." }, { status: 400 });

  const verdict = checkFile(name, mime, size);
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status });

  // Only count the upload once we know we will actually store it.
  const blocked = await g.consume();
  if (blocked) return blocked;

  const db = supabaseAdmin();
  const userId = g.auth.user.id;
  const safeName = safeFileName(name);

  const { data: row, error: insErr } = await db.from("uploads").insert({
    user_id: userId,
    file_name: safeName,
    mime_type: mime || "application/octet-stream",
    size_bytes: size,
    kind: verdict.group,
    storage_path: "pending",
    // Not "processing": nothing is being processed yet, and a row stuck in
    // this state is how an abandoned upload is recognised later.
    status: "uploading",
  }).select("id").single();

  if (insErr || !row) {
    console.error("upload insert failed:", insErr?.message);
    await g.refund();
    return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }

  const path = storagePath(userId, row.id, safeName);
  const { data: signed, error: signErr } = await db.storage.from(BUCKET).createSignedUploadUrl(path);

  if (signErr || !signed) {
    console.error("could not sign an upload URL:", signErr?.message);
    await db.from("uploads").update({ status: "failed", error: "sign" }).eq("id", row.id);
    await g.refund();
    // The caller falls back to posting the file through the app, which still
    // works for anything small enough to fit in a request.
    return NextResponse.json({ error: "Could not prepare the upload." }, { status: 503 });
  }

  await db.from("uploads").update({ storage_path: path }).eq("id", row.id);

  return NextResponse.json({
    id: row.id,
    path: signed.path ?? path,
    token: signed.token,
    name: safeName,
  });
}
