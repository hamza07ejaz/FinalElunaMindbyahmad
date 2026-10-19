import { NextResponse } from "next/server";
import { getSettings, saveSetting, DEFAULTS } from "../../../../lib/settings";
import { logAdmin } from "../../../../lib/auth";
import { adminOrFail, body } from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;
  return NextResponse.json({ settings: await getSettings(), defaults: DEFAULTS });
}

const KEYS = ["rules", "branding", "pricing", "flags", "site"] as const;
type Key = (typeof KEYS)[number];

export async function PUT(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const key = b.key as Key;
  if (!KEYS.includes(key)) return NextResponse.json({ error: "Unknown settings section." }, { status: 400 });
  if (!b.value || typeof b.value !== "object")
    return NextResponse.json({ error: "Missing settings value." }, { status: 400 });

  try {
    await saveSetting(key, b.value, gate.admin.user.id);
  } catch (err) {
    console.error("saveSetting failed:", err);
    return NextResponse.json({ error: "Could not save these settings." }, { status: 500 });
  }

  await logAdmin(gate.admin, `settings.${key}`, key);
  // getSettings re-reads and re-validates, so the client always gets the stored truth.
  return NextResponse.json({ ok: true, settings: await getSettings() });
}
