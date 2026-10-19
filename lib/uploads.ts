import { supabaseAdmin } from "./supabase/admin";

export const BUCKET = "uploads";

export const SIZE_LIMITS = {
  document: 10 * 1024 * 1024,  // 10 MB
  image: 6 * 1024 * 1024,      // 6 MB
  audio: 25 * 1024 * 1024,     // 25 MB, the transcription API's own ceiling
} as const;

export type UploadRow = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  status: string;
  pages: number | null;
  error: string | null;
  created_at: string;
};

/** Where a user's file lives in the bucket. The random id keeps names from colliding or leaking. */
export function storagePath(userId: string, uploadId: string, fileName: string) {
  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `${userId}/${uploadId}.${ext || "bin"}`;
}

/** Load one upload, but only if it belongs to this user. */
export async function getOwnedUpload(userId: string, uploadId: string) {
  const { data } = await supabaseAdmin()
    .from("uploads")
    .select("id,file_name,mime_type,kind,status,extracted_text,pages,storage_path")
    .eq("id", uploadId).eq("user_id", userId).maybeSingle();
  return data;
}

/** The text of a file, trimmed to fit a prompt without crowding out the question. */
export function contextFromUpload(
  upload: { file_name: string; extracted_text: string | null },
  budget = 24_000
) {
  const body = (upload.extracted_text ?? "").slice(0, budget);
  if (!body.trim()) return "";
  return `The student attached a file called "${upload.file_name}". Its contents:\n\n"""\n${body}\n"""\n\nAnswer using this file. If the answer is not in it, say so plainly.`;
}
