import { supabaseAdmin } from "./supabase/admin";

/**
 * "ok"    — the use was counted
 * "limit" — the user really has hit their daily limit
 * "error" — we could not check (database problem); the caller must NOT call this a limit
 */
export type ConsumeResult = "ok" | "limit" | "error";

export async function consumeUsage(userId: string, kind: string, limit: number): Promise<ConsumeResult> {
  const { data, error } = await supabaseAdmin().rpc("consume_usage", {
    p_user: userId, p_kind: kind, p_limit: limit,
  });
  if (error) {
    // Reporting this as a limit would hide a broken database behind a believable message.
    console.error(`consume_usage failed for ${kind}:`, error.message, error.hint ?? "");
    return "error";
  }
  return data === true ? "ok" : "limit";
}

export async function refundUsage(userId: string, kind: string) {
  const { error } = await supabaseAdmin().rpc("refund_usage", { p_user: userId, p_kind: kind });
  if (error) console.error("refund_usage failed:", error.message);
}

// Today's counters for one user, e.g. { chat: 3, notes: 1 }.
export async function getUsageToday(userId: string): Promise<Record<string, number>> {
  const day = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin()
    .from("usage_daily").select("kind,count").eq("user_id", userId).eq("day", day);
  if (error) { console.error("getUsageToday error:", error.message); return {}; }
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.kind as string] = r.count as number;
  return out;
}
