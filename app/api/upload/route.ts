import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { sniffLooksRight } from "../../../lib/extract";
import { BUCKET, storagePath } from "../../../lib/uploads";
import { captureRouteError } from "../../../lib/errors";
import { requestBudgetMs } from "../../../lib/deadline";
import { checkFile, finishUpload, safeFileName, withBudget } from "../../../lib/upload-core";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Posting a file through the app.
 *
 * The small-file path, and the fallback. Anything of any size now goes
 * straight to storage instead (see ./ticket and ./process), because the
 * platform refuses a request body over a few megabytes before the app ever
 * sees it. This remains for the cases where that cannot be arranged — an
 * older browser, storage that will not sign a URL — and for files small
 * enough that one round trip is simpler than three.
 *
 * Everything it decides is decided in lib/upload-core.ts, shared with the
 * other path, so the two cannot disagree about what is allowed.
 */
export async function POST(req: Request) {
  return withBudget(requestBudgetMs(), async (clock) => {
    const g = await guard(req, "upload");
    if (!g.ok) return g.res;

    let form: FormData;
    try { form = await req.formData(); }
    catch {
      /*
       * A body that will not parse is usually one the platform truncated for
       * being too big — the request never arrived whole. Saying so points at
       * the fix instead of blaming the file.
       */
      return NextResponse.json(
        { error: "That file was too large to send in one go. Please try again — it will be uploaded a different way.", tooBig: true },
        { status: 413 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file was attached." }, { status: 400 });

    const verdict = checkFile(file.name || "", file.type || "", file.size);
    if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: verdict.status });

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffLooksRight(verdict.kind, bytes))
      return NextResponse.json({ error: "That file's contents do not match its type. It may be renamed or damaged." }, { status: 415 });

    // Only count the upload once we know we will actually store it.
    const blocked = await g.consume();
    if (blocked) return blocked;

    const db = supabaseAdmin();
    const userId = g.auth.user.id;
    const safeName = safeFileName(file.name);

    const { data: row, error: insErr } = await db.from("uploads").insert({
      user_id: userId, file_name: safeName, mime_type: file.type || "application/octet-stream",
      size_bytes: file.size, kind: verdict.group, storage_path: "pending", status: "processing",
    }).select("id").single();

    if (insErr || !row) {
      console.error("upload insert failed:", insErr?.message);
      await g.refund();
      return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
    }

    const path = storagePath(userId, row.id, safeName);
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || "application/octet-stream", upsert: true,
    });
    if (upErr) {
      console.error("storage upload failed:", upErr.message);
      await db.from("uploads").update({ status: "failed", error: "storage" }).eq("id", row.id);
      await g.refund();
      return NextResponse.json({ error: "Could not store the file. Please try again." }, { status: 500 });
    }
    await db.from("uploads").update({ storage_path: path }).eq("id", row.id);

    try {
      return await finishUpload({
        rowId: row.id, userId, safeName,
        kind: verdict.kind, group: verdict.group,
        bytes, mime: file.type || "", clock, refund: g.refund,
      });
    } catch (err) {
      captureRouteError(err, req, { route: "/api/upload", status: 500 });
      throw err;
    }
  });
}

export async function GET(req: Request) {
  const g = await guard(req, "upload");
  if (!g.ok) return g.res;

  /*
   * Tidy up uploads that were started and never finished.
   *
   * A ticket is issued before the browser sends anything, so a closed tab or
   * a dropped connection leaves a row waiting for a file that will never
   * arrive. Left alone it sits in the list for ever, saying "sending…".
   * Half an hour is far longer than any real upload takes.
   */
  const stale = new Date(Date.now() - 30 * 60_000).toISOString();
  await supabaseAdmin()
    .from("uploads")
    .update({ status: "failed", error: "never finished uploading" })
    .eq("user_id", g.auth.user.id)
    .eq("status", "uploading")
    .lt("created_at", stale);

  const { data } = await supabaseAdmin()
    .from("uploads").select("id,file_name,mime_type,size_bytes,kind,status,pages,error,created_at")
    .eq("user_id", g.auth.user.id).order("created_at", { ascending: false }).limit(40);
  return NextResponse.json({ uploads: data ?? [] });
}
