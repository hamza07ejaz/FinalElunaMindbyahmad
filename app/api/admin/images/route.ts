import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { logAdmin } from "../../../../lib/auth";
import { adminOrFail, body } from "../_helpers";
import { clearImageCache, imageConfig, maskKey, searchStock } from "../../../../lib/images";

/**
 * The stock-photo key and the switches around it.
 *
 * The key is only ever sent back masked. There is no reason for the browser to
 * hold it, and an admin screen that renders a credential in an input box is one
 * screenshot away from leaking it.
 */

export const dynamic = "force-dynamic";

async function state() {
  const c = await imageConfig(true);
  return {
    hasStockKey: !!c.stockKey,
    stockPreview: maskKey(c.stockKey),
    stockProvider: c.stockProvider,
    aiImagesEnabled: c.aiImagesEnabled,
    maxImagesPerDeck: c.maxImagesPerDeck,
    status: c.status,
    lastError: c.lastError,
  };
}

export async function GET(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;
  return NextResponse.json(await state());
}

export async function PUT(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const b = await body(req);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: gate.admin.user.id };
  const done: string[] = [];

  // An empty string means "leave it alone", not "delete it" — the field arrives
  // empty on every save because it is never populated with the real key.
  const key = typeof b.stockKey === "string" ? b.stockKey.trim() : "";
  if (key) {
    if (key.length < 12 || /\s/.test(key)) {
      return NextResponse.json({ error: "That does not look like an API key." }, { status: 400 });
    }
    patch.stock_key = key.slice(0, 200);
    patch.status = "untested";
    patch.last_error = null;
    done.push("stock photo key");
  }
  if (b.clearStockKey === true) {
    patch.stock_key = "";
    patch.status = "untested";
    done.push("removed the stock photo key");
  }
  if (typeof b.aiImagesEnabled === "boolean") {
    patch.ai_images_enabled = b.aiImagesEnabled;
    done.push(b.aiImagesEnabled ? "switched AI pictures on" : "switched AI pictures off");
  }
  if (b.maxImagesPerDeck !== undefined) {
    const n = Math.round(Number(b.maxImagesPerDeck));
    if (!Number.isFinite(n) || n < 0 || n > 12) {
      return NextResponse.json({ error: "Pictures per deck must be between 0 and 12." }, { status: 400 });
    }
    patch.max_images_per_deck = n;
    done.push(`cap of ${n} pictures a deck`);
  }

  const { error } = await supabaseAdmin().from("image_config").update(patch).eq("id", 1);
  if (error) {
    console.error("image_config update failed:", error.message);
    return NextResponse.json({ error: "Could not save. Has migration 013 been run?" }, { status: 500 });
  }

  clearImageCache();
  await logAdmin(gate.admin, "images.settings", done.join(", ") || "no change");
  return NextResponse.json({ ok: true, saved: done, ...(await state()) });
}

/** Spend one real search to prove the key works, and say plainly what came back. */
export async function PATCH(req: Request) {
  const gate = await adminOrFail(req, "settings");
  if (!gate.ok) return gate.res;

  const c = await imageConfig(true);
  if (!c.stockKey) return NextResponse.json({ error: "Add a key first." }, { status: 400 });

  let ok = false;
  let detail = "";
  try {
    const img = await searchStock("library books", c.stockKey, req.signal);
    ok = !!img;
    detail = img ? `Working. Test search returned a photo by ${img.credit ?? "an unnamed photographer"}.` : "The key works but that search returned nothing.";
  } catch (err) {
    detail = (err as Error)?.message || "The test failed.";
  }

  await supabaseAdmin().from("image_config").update({
    status: ok ? "ok" : "failed",
    last_error: ok ? null : detail.slice(0, 500),
    last_checked_at: new Date().toISOString(),
  }).eq("id", 1);
  clearImageCache();

  return NextResponse.json({ ok, detail, ...(await state()) });
}
