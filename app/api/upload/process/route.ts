import { NextResponse } from "next/server";
import { readJson } from "../../../../lib/ai";
import { requestBudgetMs } from "../../../../lib/deadline";
import { captureRouteError } from "../../../../lib/errors";
import { classify, sniffLooksRight } from "../../../../lib/extract";
import { requireUser } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { BUCKET, SIZE_LIMITS } from "../../../../lib/uploads";
import { checkFile, finishUpload, withBudget } from "../../../../lib/upload-core";
import { refundUsage } from "../../../../lib/usage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Read a file the browser has already put into storage.
 *
 * The second half of an upload that went straight to storage. By the time
 * this runs the bytes are already safe, which changes what the failure modes
 * mean: nothing here can lose the file, only fail to read it.
 *
 * Everything the browser claimed when it asked for the upload is checked
 * again, against the object that actually arrived. A signed URL is permission
 * to write one path, not a promise about what was written to it: the size and
 * the contents are both confirmed here, and the allowance is handed back if
 * they turn out to be wrong.
 */
export async function POST(req: Request) {
  return withBudget(requestBudgetMs(), async (clock) => {
    const auth = await requireUser(req);
    if (!auth) return NextResponse.json({ error: "Please log in to use this feature." }, { status: 401 });
    if (auth.blocked)
      return NextResponse.json({ error: auth.blockedReason?.trim() || "This account has been suspended." }, { status: 403 });

    const body = await readJson(req);
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Which upload?" }, { status: 400 });

    const db = supabaseAdmin();
    const userId = auth.user.id;
    const refund = () => refundUsage(userId, "upload");

    const { data: row } = await db
      .from("uploads")
      .select("id,user_id,file_name,mime_type,size_bytes,kind,status,storage_path")
      .eq("id", id)
      .maybeSingle();

    // Ownership is checked against the row, never against anything in the
    // request: an id is easy to guess and must not be enough on its own.
    if (!row || row.user_id !== userId)
      return NextResponse.json({ error: "That upload is no longer available." }, { status: 404 });

    // Already done. Returning the existing row rather than reading it twice
    // means a retry after a dropped connection is free and harmless.
    if (row.status === "ready")
      return NextResponse.json({ id: row.id, name: row.file_name, kind: row.kind, status: "ready", already: true });

    if (row.status !== "uploading" && row.status !== "processing")
      return NextResponse.json({ error: "That upload has already been dealt with." }, { status: 409 });

    await db.from("uploads").update({ status: "processing" }).eq("id", row.id);

    /*
     * The file as it actually is, not as it was described.
     *
     * A signed URL authorises writing one path. It says nothing about what
     * was written there, so the size and the first few bytes are both
     * confirmed here — otherwise "I am sending a 2 MB PDF" would be taken at
     * face value for a 200 MB video.
     */
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(row.storage_path);
    if (dlErr || !blob) {
      console.error("could not read the stored file:", dlErr?.message);
      await db.from("uploads").update({ status: "failed", error: "missing" }).eq("id", row.id);
      await refund();
      return NextResponse.json(
        { id: row.id, status: "failed", retry: true, error: "That file did not finish uploading. Please try again." },
        { status: 409 },
      );
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = row.mime_type || blob.type || "application/octet-stream";
    const verdict = checkFile(row.file_name, mime, bytes.byteLength);

    if (!verdict.ok) {
      await db.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
      await db.from("uploads").update({ status: "failed", error: "rejected" }).eq("id", row.id);
      await refund();
      return NextResponse.json({ id: row.id, status: "failed", error: verdict.error }, { status: verdict.status });
    }

    if (!sniffLooksRight(verdict.kind, bytes)) {
      await db.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
      await db.from("uploads").update({ status: "failed", error: "mismatch" }).eq("id", row.id);
      await refund();
      return NextResponse.json(
        { id: row.id, status: "failed", error: "That file's contents do not match its type. It may be renamed or damaged." },
        { status: 415 },
      );
    }

    // The stored size is what the file really weighs, so the row is corrected
    // if the browser's figure was off.
    if (bytes.byteLength !== row.size_bytes)
      await db.from("uploads").update({ size_bytes: bytes.byteLength }).eq("id", row.id);

    try {
      return await finishUpload({
        rowId: row.id,
        userId,
        safeName: row.file_name,
        kind: verdict.kind,
        group: verdict.group,
        bytes,
        mime,
        clock,
        refund,
      });
    } catch (err) {
      captureRouteError(err, req, { route: "/api/upload/process", status: 500 });
      throw err;
    }
  });
}

/** Exported for the tests that check the limits are the ones advertised. */
export const LIMITS = { SIZE_LIMITS, classify };
