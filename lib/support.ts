import { supabaseAdmin } from "./supabase/admin";
import { MAX_MESSAGES_PER_DAY, MAX_OPEN_TICKETS, type MessageRow } from "./support-shared";

/**
 * Support ticket storage.
 *
 * Both sides of a conversation live in the same two tables, and ownership is
 * checked in code on every read: the tables have RLS on with no policies, so
 * the service key is the only way in and nothing is trusted from the client
 * beyond the ticket id.
 */

export * from "./support-shared";

/** Load a ticket only if this user owns it. */
export async function getOwnedTicket(userId: string, ticketId: string) {
  const { data } = await supabaseAdmin()
    .from("support_tickets")
    .select("id,user_id,subject,category,status,created_at,last_reply_at,unread_for_user,unread_for_staff")
    .eq("id", ticketId).eq("user_id", userId).maybeSingle();
  return data;
}

export async function getMessages(ticketId: string) {
  const { data } = await supabaseAdmin()
    .from("support_messages")
    .select("id,author,author_email,body,created_at")
    .eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(200);
  return (data ?? []) as MessageRow[];
}

/**
 * Has this user hit a fair-use wall? Returns a sentence to show them, or null.
 * This is deliberately not part of the daily AI allowance: being unable to
 * reach support because you ran out of chat messages would be absurd.
 */
export async function supportLimitHit(userId: string, opening: boolean): Promise<string | null> {
  const db = supabaseAdmin();

  if (opening) {
    const { count } = await db.from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).neq("status", "closed");
    if ((count ?? 0) >= MAX_OPEN_TICKETS)
      return `You already have ${MAX_OPEN_TICKETS} open tickets. Please reply on one of those instead of opening another.`;
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: mine } = await db.from("support_tickets").select("id").eq("user_id", userId).limit(200);
  const ids = (mine ?? []).map((t) => t.id);
  if (ids.length) {
    const { count } = await db.from("support_messages")
      .select("id", { count: "exact", head: true })
      .in("ticket_id", ids).eq("author", "user").gte("created_at", since);
    if ((count ?? 0) >= MAX_MESSAGES_PER_DAY)
      return "You have sent a lot of messages today. Please wait for a reply before sending more.";
  }

  return null;
}
