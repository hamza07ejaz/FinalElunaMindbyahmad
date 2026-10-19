import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { getSettings } from "../../../lib/settings";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import {
  CATEGORIES, MAX_BODY, MAX_SUBJECT, cleanText, isCategory, supportLimitHit,
} from "../../../lib/support";

export const dynamic = "force-dynamic";

/** The user's own tickets, newest conversation first. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from("support_tickets")
    .select("id,subject,category,status,created_at,last_reply_at,unread_for_user")
    .eq("user_id", auth.user.id).order("last_reply_at", { ascending: false }).limit(50);

  if (error) {
    console.error("support list failed:", error.message);
    return NextResponse.json({ error: "Could not load your tickets." }, { status: 500 });
  }

  const { flags, branding } = await getSettings();
  return NextResponse.json({
    tickets: data ?? [],
    categories: CATEGORIES,
    enabled: flags.supportEnabled,
    supportEmail: branding.supportEmail,
  });
}

/** Open a new ticket with its first message. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { flags, branding } = await getSettings();
  if (!flags.supportEnabled)
    return NextResponse.json(
      { error: `In-app support is off right now. Please email ${branding.supportEmail}.` },
      { status: 403 }
    );

  // A blocked user can still write in: an appeal is exactly what support is for.
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* handled by the empty checks below */ }

  const subject = cleanText(b.subject, MAX_SUBJECT);
  const message = cleanText(b.message, MAX_BODY);
  const category = isCategory(b.category) ? b.category : "other";

  if (subject.length < 3) return NextResponse.json({ error: "Give your ticket a short subject." }, { status: 400 });
  if (message.length < 10) return NextResponse.json({ error: "Please describe the problem in a sentence or two." }, { status: 400 });

  const limited = await supportLimitHit(auth.user.id, true);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  const db = supabaseAdmin();
  const { data: ticket, error } = await db.from("support_tickets").insert({
    user_id: auth.user.id,
    email: auth.user.email ?? null,
    subject, category,
    status: "open",
    unread_for_staff: true,
    unread_for_user: false,
  }).select("id,subject,category,status,created_at,last_reply_at").single();

  if (error || !ticket) {
    console.error("support ticket insert failed:", error?.message);
    return NextResponse.json({ error: "Could not open your ticket. Please try again." }, { status: 500 });
  }

  const { error: msgErr } = await db.from("support_messages").insert({
    ticket_id: ticket.id, author: "user", author_id: auth.user.id,
    author_email: auth.user.email ?? null, body: message,
  });

  if (msgErr) {
    // A ticket with no message is worse than no ticket: remove it so the user
    // sees a clean failure rather than an empty thread nobody can answer.
    console.error("support first message failed:", msgErr.message);
    await db.from("support_tickets").delete().eq("id", ticket.id);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ticket });
}
