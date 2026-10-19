import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { getSettings } from "../../../lib/settings";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { captureRouteError } from "../../../lib/errors";

export const dynamic = "force-dynamic";

/** What the UI needs to decide between "Start free trial" and "Upgrade". */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { flags } = await getSettings();

  return NextResponse.json({
    enabled: flags.trialEnabled,
    days: flags.trialDays,
    onTrial: auth.onTrial,
    trialEndsAt: auth.trialEndsAt,
    used: auth.trialUsed,
    plan: auth.plan,
    eligible: flags.trialEnabled && !auth.trialUsed && auth.paidPlan !== "premium" && !auth.blocked,
  });
}

const REFUSALS: Record<string, { status: number; message: string }> = {
  already_used: { status: 409, message: "Your free trial has already been used. Upgrade to keep Premium features." },
  already_premium: { status: 409, message: "You are already on Premium." },
  blocked: { status: 403, message: "This account is suspended." },
  not_found: { status: 404, message: "We could not find your account." },
};

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { flags } = await getSettings();
  if (!flags.trialEnabled)
    return NextResponse.json({ error: "Free trials are not available at the moment." }, { status: 403 });

  // start_trial does the eligibility check inside one statement, so two taps on
  // the button cannot hand out two trials.
  const { data, error } = await supabaseAdmin().rpc("start_trial", {
    p_user: auth.user.id,
    p_days: flags.trialDays,
  });

  if (error) {
    console.error("start_trial failed:", error.message);
    captureRouteError(error, req, { route: "/api/trial", status: 500 });
    return NextResponse.json({ error: "Could not start your trial just now. Please try again." }, { status: 500 });
  }

  const result = (data ?? {}) as { ok?: boolean; reason?: string; trial_ends_at?: string; days?: number };
  if (!result.ok) {
    const refusal = REFUSALS[result.reason ?? ""] ?? { status: 400, message: "Your trial could not be started." };
    return NextResponse.json({ error: refusal.message, reason: result.reason }, { status: refusal.status });
  }

  return NextResponse.json({ ok: true, trialEndsAt: result.trial_ends_at, days: result.days });
}
