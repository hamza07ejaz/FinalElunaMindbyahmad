import { NextResponse } from "next/server";
import { listModels, type Provider } from "../../../../../lib/ai";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { adminOrFail, body, str } from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The models a key can actually use.
 *
 * Typing a model name by hand is a guess that fails later, in front of a
 * student: OpenAI renames and retires models every few months, and a key does
 * not necessarily have access to everything that exists. The provider knows
 * the answer, so the admin screen asks it instead of relying on a list written
 * down somewhere and left to rot.
 */
export async function POST(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const id = str(b.id, 60);

  let candidate: Provider;

  if (id) {
    // A saved key: the browser never had it, so it is read here.
    const { data } = await supabaseAdmin()
      .from("ai_providers").select("label,api_key,base_url,model").eq("id", id).maybeSingle();
    if (!data) return NextResponse.json({ error: "That key is gone." }, { status: 404 });
    candidate = {
      id, label: data.label as string, apiKey: data.api_key as string,
      baseUrl: (data.base_url as string) || "", model: (data.model as string) || "",
      transcribeModel: "",
    };
  } else {
    const apiKey = str(b.apiKey, 400);
    if (!apiKey) return NextResponse.json({ error: "Paste a key first." }, { status: 400 });
    candidate = {
      id: null, label: "unsaved", apiKey,
      baseUrl: str(b.baseUrl, 300), model: "", transcribeModel: "",
    };
  }

  const result = await listModels(candidate);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({ chat: result.chat, audio: result.audio });
}
