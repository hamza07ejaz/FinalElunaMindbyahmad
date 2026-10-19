import { NextResponse } from "next/server";
import { clearProviderCache, explain, testProvider, type Provider } from "../../../../lib/ai";
import { logAdmin } from "../../../../lib/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { adminOrFail, body, str } from "../_helpers";

// Vercel gives a function 10 seconds unless it is told otherwise, and an AI
// answer of any length takes longer than that. Without this line the request is
// killed mid-generation and the user sees a failure with nothing in the logs.
export const maxDuration = 60;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI keys.
 *
 * A key is write-only from the browser's point of view: it can be set and
 * replaced, but never read back. Every response masks it down to a preview,
 * so an admin screen left open on a shared machine does not leak the account.
 */

const FIELDS = "id,label,base_url,model,transcribe_model,priority,enabled,status,last_error,last_checked_at,last_ok_at,calls,failures,created_at";

/** Enough to recognise which key this is, not enough to use it. */
function mask(key: string): string {
  const k = (key ?? "").trim();
  if (k.length < 12) return "••••";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const { data, error } = await supabaseAdmin()
    .from("ai_providers").select(`${FIELDS},api_key`).order("priority").order("created_at");

  if (error) {
    const missing = /does not exist|could not find/i.test(error.message);
    return NextResponse.json({
      error: missing
        ? "The AI keys table is not set up yet. Run supabase/010_ai_providers.sql, then reload."
        : "Could not load the keys.",
      setupNeeded: missing,
    }, { status: missing ? 503 : 500 });
  }

  const providers = (data ?? []).map(({ api_key, ...rest }) => ({ ...rest, key_preview: mask(api_key as string) }));

  // What the app would fall back to if this table were empty.
  const envKey = process.env.OPENAI_API_KEY?.trim();
  return NextResponse.json({
    providers,
    env: envKey
      ? {
          present: true,
          preview: mask(envKey),
          baseUrl: process.env.OPENAI_BASE_URL?.trim() || "",
          model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        }
      : { present: false },
  });
}

/** Try a key without storing it, so a bad one never becomes the live one. */
export async function PUT(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const id = str(b.id, 60);

  let candidate: Provider;
  if (id) {
    // Testing a saved key: the browser never had it, so read it here.
    const { data } = await supabaseAdmin()
      .from("ai_providers").select("label,api_key,base_url,model,transcribe_model").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "That key is gone." }, { status: 404 });
    candidate = {
      id, label: data.label as string, apiKey: data.api_key as string,
      baseUrl: (data.base_url as string) || "", model: (data.model as string) || "gpt-4o-mini",
      transcribeModel: (data.transcribe_model as string) || "",
    };
  } else {
    const apiKey = str(b.apiKey, 400);
    if (!apiKey) return NextResponse.json({ error: "Paste a key to test." }, { status: 400 });
    candidate = {
      id: null, label: "unsaved", apiKey,
      baseUrl: str(b.baseUrl, 300), model: str(b.model, 80) || "gpt-4o-mini", transcribeModel: "",
    };
  }

  const result = await testProvider(candidate);

  // A test on a saved key is also a health check, so record what it found.
  if (id) {
    const db = supabaseAdmin();
    if (result.ok) await db.rpc("ai_provider_ok", { p_id: id }).then(() => {}, () => {});
    else await db.rpc("ai_provider_failed", { p_id: id, p_error: result.error }).then(() => {}, () => {});
  }

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const label = str(b.label, 60);
  const apiKey = str(b.apiKey, 400);
  if (!label) return NextResponse.json({ error: "Give the key a name so you can tell them apart." }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: "Paste the key." }, { status: 400 });

  const { error } = await supabaseAdmin().from("ai_providers").insert({
    label,
    api_key: apiKey,
    base_url: str(b.baseUrl, 300),
    model: str(b.model, 80) || "gpt-4o-mini",
    transcribe_model: str(b.transcribeModel, 80),
    priority: typeof b.priority === "number" ? Math.max(0, Math.round(b.priority)) : 100,
    enabled: b.enabled !== false,
  });

  if (error) {
    console.error("ai provider insert failed:", error.message);
    return NextResponse.json({ error: "Could not save the key." }, { status: 500 });
  }

  clearProviderCache();
  // The label, never the key.
  await logAdmin(gate.admin, "ai.key.add", label);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const id = str(b.id, 60);
  if (!id) return NextResponse.json({ error: "Which key?" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const done: string[] = [];

  if (typeof b.label === "string" && b.label.trim()) { patch.label = str(b.label, 60); done.push("name"); }
  // Only replace the key when a new one is actually typed. An empty field means
  // "leave it alone", because the form never had the real value to send back.
  if (typeof b.apiKey === "string" && b.apiKey.trim()) {
    patch.api_key = str(b.apiKey, 400);
    patch.status = "unknown";
    patch.last_error = null;
    done.push("key");
  }
  if (typeof b.baseUrl === "string") { patch.base_url = str(b.baseUrl, 300); done.push("base url"); }
  if (typeof b.model === "string" && b.model.trim()) { patch.model = str(b.model, 80); done.push("model"); }
  if (typeof b.transcribeModel === "string") { patch.transcribe_model = str(b.transcribeModel, 80); done.push("audio model"); }
  if (typeof b.priority === "number" && Number.isFinite(b.priority)) { patch.priority = Math.max(0, Math.round(b.priority)); done.push("order"); }
  if (typeof b.enabled === "boolean") { patch.enabled = b.enabled; done.push(b.enabled ? "on" : "off"); }

  if (!done.length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { error } = await supabaseAdmin().from("ai_providers").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });

  clearProviderCache();
  await logAdmin(gate.admin, "ai.key.update", id, { changes: done });
  return NextResponse.json({ ok: true, changed: done });
}

export async function DELETE(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const id = str(new URL(req.url).searchParams.get("id"), 60);
  if (!id) return NextResponse.json({ error: "Which key?" }, { status: 400 });

  const { error } = await supabaseAdmin().from("ai_providers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not delete the key." }, { status: 500 });

  clearProviderCache();
  await logAdmin(gate.admin, "ai.key.delete", id);
  return NextResponse.json({ ok: true });
}

export const EXPLAIN_NOTE = explain;
