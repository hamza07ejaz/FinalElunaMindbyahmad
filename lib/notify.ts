import { supabaseAdmin } from "./supabase/admin";

/**
 * Notifications, written from the server only.
 *
 * Every call here is deliberately fire-and-forget. A notification is a note
 * about something that already happened — the file is uploaded, the payment
 * went through, the ticket is in the queue. If writing the note fails, the
 * thing itself still happened, and failing the request that did it would turn
 * a cosmetic problem into a real one.
 *
 * So nothing in this file throws, and nothing in this file is awaited in a
 * path a user is waiting on.
 */

export type NotificationKind =
  | "upload"    // a file finished, or could not be read
  | "support"   // a reply on a ticket
  | "billing"   // plan changes and payments
  | "trial"     // a trial about to end
  | "system"    // anything the admin announces
  | "signup"    // a new account, for admins
  | "error";    // something broke, for admins

type Note = {
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
};

/** Keep a row small enough to render in a dropdown without truncating oddly. */
const trim = (s: string | undefined, max: number) =>
  (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function insert(userId: string | null, note: Note): Promise<void> {
  try {
    await supabaseAdmin().from("notifications").insert({
      user_id: userId,
      kind: note.kind,
      title: trim(note.title, 120),
      body: trim(note.body, 300),
      href: trim(note.href, 200),
    });
  } catch (err) {
    // Including a missing table: the migration may not have been run yet, and
    // that must not stop a student uploading a file.
    console.error("notification write failed:", (err as Error)?.message);
  }
}

/** Tell one person something about their own account. */
export function notifyUser(userId: string, note: Note): void {
  if (!userId) return;
  void insert(userId, note);
}

/** Put something in front of whoever is staffing the admin panel. */
export function notifyAdmins(note: Note): void {
  void insert(null, note);
}

/* ------------------------------------------------------------------ */
/* The notes worth sending, written once so the wording stays the same */
/* ------------------------------------------------------------------ */

export const notes = {
  uploadReady: (userId: string, fileName: string) =>
    notifyUser(userId, {
      kind: "upload",
      title: "Your file is ready",
      body: `${trim(fileName, 60)} has been read and can be used in any tool.`,
      href: "/dashboard/files",
    }),

  uploadFailed: (userId: string, fileName: string, why: string) =>
    notifyUser(userId, {
      kind: "upload",
      title: "A file could not be read",
      body: `${trim(fileName, 60)}: ${trim(why, 180)}`,
      href: "/dashboard/files",
    }),

  /**
   * @param planName the plan's name as the owner typed it, not a slug — this
   *   text is read by the customer, and there is no fixed set of tiers now.
   * @param paid false only when they have dropped back to the free plan.
   */
  planChanged: (userId: string, planName: string, paid = true) =>
    notifyUser(userId, {
      kind: "billing",
      title: paid ? `You are on ${planName}` : "Your plan changed",
      body: paid
        ? `${planName} is active, with its tools unlocked and its daily limits applied.`
        : "Your account is back on the free plan. Your work is untouched.",
      href: "/dashboard",
    }),

  supportReply: (userId: string, ticketId: string) =>
    notifyUser(userId, {
      kind: "support",
      title: "We replied to your message",
      body: "Open the conversation to read it.",
      href: `/dashboard/support/${ticketId}`,
    }),

  /* ---- for admins ---- */

  newTicket: (ticketId: string, subject: string) =>
    notifyAdmins({
      kind: "support",
      title: "New support message",
      body: trim(subject, 180),
      href: `/admin/support/${ticketId}`,
    }),

  newSignup: (email: string) =>
    notifyAdmins({
      kind: "signup",
      title: "New account",
      // The address is the one thing an admin needs to act on a signup, and
      // the admin panel already shows it on the users page.
      body: trim(email, 120),
      href: "/admin/users",
    }),

  payment: (email: string, amount: string) =>
    notifyAdmins({
      kind: "billing",
      title: "Premium subscription started",
      body: `${trim(email, 80)} — ${trim(amount, 20)}`,
      href: "/admin/users",
    }),

  errorSpike: (message: string, count: number) =>
    notifyAdmins({
      kind: "error",
      title: `An error is repeating (${count} times)`,
      body: trim(message, 200),
      href: "/admin/errors",
    }),
};
