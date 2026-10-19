import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";
import { getSettings } from "../../../lib/settings";
import { checkoutMode, readiness, stripeConfig } from "../../../lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Self-check for the signed-in user. Reports what the server sees and whether each
 * piece of the setup works. It never prints a key — only what KIND of key is in use,
 * which is the usual cause of "my admin account is not recognised".
 */

/** Work out which Supabase key is in SUPABASE_SERVICE_ROLE_KEY, without revealing it. */
function describeServerKey(key: string): { kind: string; correct: boolean } {
  if (!key) return { kind: "not set at all", correct: false };
  if (key.startsWith("sb_secret_")) return { kind: "secret key", correct: true };
  if (key.startsWith("sb_publishable_"))
    return { kind: "PUBLISHABLE key — this is the browser key, not the server key", correct: false };
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString()) as { role?: string };
      if (payload.role === "service_role") return { kind: "legacy service_role key", correct: true };
      if (payload.role === "anon") return { kind: `legacy ANON key — this is the browser key, not the server key`, correct: false };
      return { kind: `legacy key with role "${payload.role ?? "unknown"}"`, correct: false };
    } catch { return { kind: "unreadable token", correct: false }; }
  }
  return { kind: "unrecognised format", correct: false };
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Log in first, then open this page again." }, { status: 401 });

  const db = supabaseAdmin();
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/^https?:\/\//, "").split(".")[0];
  const serverKey = describeServerKey(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

  const { data: profile, error: profileErr } = await db
    .from("profiles").select("id,email,plan,role,status").eq("id", auth.user.id).maybeSingle();

  // Can the server see rows that only a full-access key is allowed to see?
  const { count: profileCount, error: countErr } = await db
    .from("profiles").select("id", { count: "exact", head: true });

  const probe = await db.rpc("consume_usage", { p_user: auth.user.id, p_kind: "__probe__", p_limit: 0 });

  const readCheck = async (name: string) => {
    const { error } = await db.from(name).select("*").limit(1);
    return error ? `ERROR: ${error.message}` : "readable";
  };
  const [usageDaily, chats, notes, appSettings] = await Promise.all([
    readCheck("usage_daily"), readCheck("chats"), readCheck("notes_history"), readCheck("app_settings"),
  ]);

  // Who the admins are is the one thing on this page that helps an attacker:
  // it hands them the exact accounts worth phishing. A non-admin gets the
  // count, which is all the diagnostic needs ("nobody has been promoted yet"),
  // and never the addresses.
  const isAdmin = auth.role === "admin";
  const { data: admins } = await db.from("profiles").select("email").eq("role", "admin");
  const adminEmails = (admins ?? []).map((a) => a.email);
  const settings = await getSettings();

  // The AI side of the setup. Labels and health only — never a key, not even a
  // masked one, because this page is readable by any signed-in user.
  const { data: keyRows, error: keyErr } = await db
    .from("ai_providers").select("label,enabled,status,last_error,last_checked_at,priority").order("priority");
  const keys = keyRows ?? [];
  const liveKeys = keys.filter((k) => k.enabled);
  const envKeyPresent = !!process.env.OPENAI_API_KEY?.trim();
  const ai = {
    keysTable: keyErr ? `NOT SET UP: run supabase/010_ai_providers.sql (${keyErr.message})` : "readable",
    keysConfigured: keys.length,
    keysSwitchedOn: liveKeys.length,
    environmentKeyAsBackup: envKeyPresent,
    aiPausedInAdmin: settings.flags.aiDisabled,
    health: liveKeys.map((k) => ({
      name: k.label,
      status: k.status ?? "untested",
      lastProblem: k.last_error ?? null,
      lastChecked: k.last_checked_at ?? null,
    })),
  };

  // Payments. No key or secret appears here — only what is set and whether it works.
  const stripeCfg = await stripeConfig(true);
  const stripeReady = readiness(stripeCfg);
  const mode = await checkoutMode();
  const payments = {
    checkout: mode,   // live | demo | off
    keySource: stripeCfg.source,
    stripeMode: stripeReady.mode,
    stripeAccount: stripeCfg.accountName || null,
    priceSet: !!stripeCfg.priceId,
    webhookSecretSet: !!stripeCfg.webhookSecret,
    problems: stripeReady.problems,
    demoCheckoutEnvStillSet: process.env.DEMO_CHECKOUT === "1",
  };

  // The single most useful line: the one thing to fix first.
  let verdict = "Everything looks right.";
  if (!serverKey.correct)
    verdict = `FIX THIS FIRST: SUPABASE_SERVICE_ROLE_KEY on your host holds the ${serverKey.kind}. Replace it with the project's secret key, then redeploy.`;
  else if (probe.error)
    verdict = "FIX THIS: the server cannot run consume_usage. Run supabase/004_fixes.sql.";
  else if (!profile)
    verdict = "FIX THIS: your login has no matching row in profiles. See the note below.";
  else if (settings.flags.aiDisabled)
    verdict = "FIX THIS: AI is paused in Admin → Branding & site. Nothing will generate until it is switched back on.";
  else if (!ai.keysSwitchedOn && !envKeyPresent)
    verdict = "FIX THIS: there is no AI key. Add one in Admin → AI keys and press Test.";
  else if (ai.keysSwitchedOn && ai.health.every((k) => k.status === "failed") && !envKeyPresent)
    verdict = `FIX THIS: every AI key is failing. The last problem was: ${ai.health[0].lastProblem ?? "unknown"}`;
  else if (payments.checkout === "live" && !payments.webhookSecretSet)
    // Cannot normally happen — "live" requires a webhook secret — but if it ever
    // does, it is the single worst state: money in, nothing delivered.
    verdict = "FIX THIS NOW: payments are live with no webhook secret. Customers can be charged and not upgraded.";
  else if (auth.role !== "admin")
    verdict = "Your account is not an admin yet. Set role = 'admin' for your email in profiles, then log out and back in.";

  // Everything about the person asking is theirs to see. Everything about the
  // installation — user counts, the schema, which keys exist, the payment setup
  // — is an admin's. A signed-in stranger can still work out why their own
  // login is not recognised, which is what this page is for.
  return NextResponse.json({
    verdict,
    whatTheServerSees: {
      supabaseProject: projectRef,
      serverKeyType: serverKey.kind,
      serverKeyIsCorrect: serverKey.correct,
      yourEmail: auth.user.email ?? null,
      yourUserId: auth.user.id,
      yourRole: auth.role,
      yourPlan: auth.plan,
      canOpenAdminPanel: isAdmin,
    },
    yourProfileRow: profileErr ? `ERROR: ${profileErr.message}` : profile ?? "NO ROW FOUND for your user id",
    adminAccountsInThisDatabase: isAdmin ? adminEmails : `${adminEmails.length} (addresses are admin-only)`,
    serverCanReachYourData: probe.error ? `BROKEN: ${probe.error.message}` : "OK",
    ...(isAdmin ? {
      profilesVisibleToServer: countErr ? `ERROR: ${countErr.message}` : profileCount,
      schema: {
        usage_daily: usageDaily,
        chats,
        notes_history: notes,
        app_settings: appSettings,
        consume_usage_function: probe.error ? `BROKEN: ${probe.error.message}` : "OK",
      },
      ai,
      payments,
      limits: {
        chatFreePerDay: settings.rules.chat.freePerDay,
        notesFreePerDay: settings.rules.notes.freePerDay,
        aiPaused: settings.flags.aiDisabled,
      },
    } : {}),
  });
}
