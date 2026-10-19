import { NextResponse } from "next/server";
import { requireUser } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { MAX_BODY, cleanText, getMessages, getOwnedTicket, supportLimitHit } from "../../../../lib/support";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One of the user's own threads. Opening it clears their unread mark. */
export async function GET(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;

  const ticket = await getOwnedTicket(auth.user.id, id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const messages = await getMessages(id);
  if (ticket.unread_for_user) {
    await supabaseAdmin().from("support_tickets").update({ unread_for_user: false }).eq("id", id);
  }

  return NextResponse.json({ ticket: { ...ticket, unread_for_user: false }, messages });
}

/** The user replies, which puts the ticket back in the staff queue. */
export async function POST(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;

  const ticket = await getOwnedTicket(auth.user.id, id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  if (ticket.status === "closed")
    return NextResponse.json({ error: "This ticket is closed. Open a new one and we will pick it up." }, { status: 409 });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* handled below */ }
  const message = cleanText(b.message, MAX_BODY);
  if (message.length < 2) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  const limited = await supportLimitHit(auth.user.id, false);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  const db = supabaseAdmin();
  const { error } = await db.from("support_messages").insert({
    ticket_id: id, author: "user", author_id: auth.user.id,
    author_email: auth.user.email ?? null, body: message,
  });
  if (error) {
    console.error("support reply failed:", error.message);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }

  const now = new Date().toISOString();
  await db.from("support_tickets").update({
    status: "open", last_reply_at: now, updated_at: now,
    unread_for_staff: true, unread_for_user: false,
  }).eq("id", id);

  return NextResponse.json({ ok: true, messages: await getMessages(id) });
}

/** The user closes their own ticket once they are happy. */
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { id } = await params;

  const ticket = await getOwnedTicket(auth.user.id, id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* handled below */ }
  if (b.close !== true) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin().from("support_tickets").update({
    status: "closed", closed_at: now, updated_at: now, unread_for_staff: false,
  }).eq("id", id).eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: "Could not close the ticket." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
