import { NextResponse } from "next/server";
import { logAdmin } from "../../../../../lib/auth";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { MAX_BODY, cleanText, getMessages, isStatus } from "../../../../../lib/support";
import { adminOrFail, body } from "../../_helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function loadTicket(id: string) {
  const { data } = await supabaseAdmin()
    .from("support_tickets")
    .select("id,user_id,email,subject,category,status,created_at,last_reply_at,unread_for_staff")
    .eq("id", id).maybeSingle();
  return data;
}

/** Open a thread. Doing so clears the "waiting on us" mark. */
export async function GET(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "support");
  if (!gate.ok) return gate.res;
  const { id } = await params;

  const ticket = await loadTicket(id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const db = supabaseAdmin();
  const messages = await getMessages(id);

  // Context worth having before replying: plan, trial and whether they are blocked.
  const { data: profile } = await db.from("profiles")
    .select("plan,status,role,created_at,trial_ends_at").eq("id", ticket.user_id).maybeSingle();

  if (ticket.unread_for_staff) await db.from("support_tickets").update({ unread_for_staff: false }).eq("id", id);

  return NextResponse.json({ ticket: { ...ticket, unread_for_staff: false }, messages, profile: profile ?? null });
}

/** Reply, change the status, or both. */
export async function POST(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "support");
  if (!gate.ok) return gate.res;
  const { id } = await params;

  const ticket = await loadTicket(id);
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  const b = await body(req);
  const message = cleanText(b.message, MAX_BODY);
  const nextStatus = isStatus(b.status) ? b.status : null;
  if (!message && !nextStatus) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });

  const db = supabaseAdmin();
  const now = new Date().toISOString();

  if (message) {
    const { error } = await db.from("support_messages").insert({
      ticket_id: id, author: "staff", author_id: gate.admin.user.id,
      author_email: gate.admin.user.email ?? null, body: message,
    });
    if (error) {
      console.error("admin support reply failed:", error.message);
      return NextResponse.json({ error: "Could not send the reply." }, { status: 500 });
    }
  }

  // A reply marks the ticket answered unless the status was set explicitly.
  const status = nextStatus ?? (message ? "answered" : ticket.status);
  const patch: Record<string, unknown> = {
    status, updated_at: now, unread_for_staff: false,
    // Only a new message is worth a notification dot on the user's side.
    ...(message ? { last_reply_at: now, unread_for_user: true } : {}),
    ...(status === "closed" ? { closed_at: now } : { closed_at: null }),
  };

  const { error: upErr } = await db.from("support_tickets").update(patch).eq("id", id);
  if (upErr) {
    console.error("admin support status failed:", upErr.message);
    return NextResponse.json({ error: "The reply was sent but the status could not be updated." }, { status: 500 });
  }

  await logAdmin(gate.admin, "support.reply", ticket.email ?? id, {
    ticket: id, status, replied: !!message,
  });

  return NextResponse.json({ ok: true, status, messages: await getMessages(id) });
}
