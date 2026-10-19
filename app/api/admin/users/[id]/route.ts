import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { can, logAdmin } from "../../../../../lib/auth";
import { adminOrFail, body, str } from "../../_helpers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "users.view");
  if (!gate.ok) return gate.res;
  const { id } = await params;

  const { data, error } = await supabaseAdmin().rpc("admin_user_detail", { p_user: id });
  if (error) return NextResponse.json({ error: "Could not load this user." }, { status: 500 });
  if (!data?.profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // The page hides controls the caller cannot use. PATCH checks again, so this
  // is only to avoid showing a sub-admin a button that would refuse them.
  return NextResponse.json({
    ...data,
    viewer: {
      role: gate.admin.role,
      canPlan: can(gate.admin, "users.plan"),
      canRole: can(gate.admin, "users.role"),
      isSelf: gate.admin.user.id === id,
    },
  });
}

/**
 * Admin actions on one user. Each one is gated on its own permission, so a
 * sub-admin can calm a user down without being able to hand out Premium or
 * promote themselves:
 *   status   -> "active" | "blocked"           users.moderate
 *   note     -> free text                      users.moderate
 *   resetUsage -> true                         users.moderate
 *   plan     -> "free" | "premium"             users.plan
 *   trialDays -> number (grant or extend)      users.plan
 *   endTrial -> true                           users.plan
 *   role     -> "user" | "sub_admin" | "admin" users.role
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await adminOrFail(req, "users.moderate");
  if (!gate.ok) return gate.res;
  const { id } = await params;
  const b = await body(req);
  const db = supabaseAdmin();
  const actor = gate.admin;

  const { data: target } = await db.from("profiles").select("id,email,role,plan,status").eq("id", id).single();
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const done: string[] = [];
  const denied = (what: string) =>
    NextResponse.json({ error: `Your role cannot change ${what}. Ask a full admin.` }, { status: 403 });

  // ---- money: plan and trials ----
  if (b.plan === "free" || b.plan === "premium") {
    if (!can(actor, "users.plan")) return denied("plans");
    patch.plan = b.plan;
    done.push(`plan=${b.plan}`);
  }

  if (typeof b.trialDays === "number" && Number.isFinite(b.trialDays)) {
    if (!can(actor, "users.plan")) return denied("trials");
    const days = Math.min(90, Math.max(1, Math.round(b.trialDays)));
    const ends = new Date(Date.now() + days * 86_400_000).toISOString();
    patch.trial_started_at = new Date().toISOString();
    patch.trial_ends_at = ends;
    done.push(`trial=${days}d`);
  }

  if (b.endTrial === true) {
    if (!can(actor, "users.plan")) return denied("trials");
    // Keep trial_started_at: it is the record that this account has had its one trial.
    patch.trial_ends_at = null;
    done.push("trial ended");
  }

  // ---- moderation ----
  if (b.status === "active" || b.status === "blocked") {
    if (target.id === actor.user.id && b.status === "blocked")
      return NextResponse.json({ error: "You cannot block your own account." }, { status: 400 });
    // A sub-admin must not be able to lock out the people above them.
    if (b.status === "blocked" && target.role === "admin" && actor.role !== "admin")
      return NextResponse.json({ error: "You cannot block an admin." }, { status: 403 });
    patch.status = b.status;
    patch.blocked_reason = b.status === "blocked" ? (str(b.reason, 200) || "Suspended by an administrator.") : null;
    done.push(`status=${b.status}`);
  }

  // ---- security: who is staff ----
  if (b.role === "user" || b.role === "sub_admin" || b.role === "admin") {
    if (!can(actor, "users.role")) return denied("roles");
    if (target.id === actor.user.id && b.role !== "admin") {
      const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
      if ((count ?? 0) <= 1)
        return NextResponse.json({ error: "You are the only admin. Promote someone else first." }, { status: 400 });
    }
    patch.role = b.role;
    done.push(`role=${b.role}`);
  }

  if (typeof b.note === "string") { patch.admin_note = str(b.note, 1000); done.push("note"); }

  if (Object.keys(patch).length) {
    const { error } = await db.from("profiles").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  }

  if (b.resetUsage === true) {
    const today = new Date().toISOString().slice(0, 10);
    await db.from("usage_daily").delete().eq("user_id", id).eq("day", today);
    done.push("usage reset");
  }

  if (!done.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await logAdmin(gate.admin, "user.update", target.email ?? id, { changes: done });
  return NextResponse.json({ ok: true, changed: done });
}
