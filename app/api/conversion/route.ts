import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";
import { supabaseAdmin } from "../../../lib/supabase/admin";

/**
 * The one purchase this browser is allowed to report, if there is one.
 *
 * Called by the success page once the plan has actually turned premium. The
 * row it returns is marked reported inside the database, in a single
 * statement, so a refresh, the back button, a second tab or a second device
 * all get nothing back. An ad platform counting sales cannot tell a repeated
 * conversion from a real one, so "exactly once" has to be enforced somewhere
 * that survives the page being reloaded — which means not in the page.
 *
 * Returns the amount in major units, because that is what a tag expects, and
 * nothing else at all: no email, no customer id, no subscription id.
 */

export const dynamic = "force-dynamic";

/** Currencies with no minor unit, where Stripe's integer is already the amount. */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  try {
    const { data, error } = await supabaseAdmin()
      .rpc("claim_conversion", { p_user: auth.user.id });

    if (error) {
      // Most likely the migration has not been run. The purchase itself is
      // unaffected, so this is a quiet failure rather than an error page.
      console.error("claim_conversion failed:", error.message);
      return NextResponse.json({ conversion: null });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) return NextResponse.json({ conversion: null });

    const currency = String(row.currency || "usd").toLowerCase();
    const minor = Number(row.amount_total) || 0;
    const value = ZERO_DECIMAL.has(currency) ? minor : minor / 100;

    return NextResponse.json({
      conversion: {
        transaction_id: String(row.id),
        value,
        currency: currency.toUpperCase(),
        // The plan's slug. Not personal data, and it is what lets revenue be
        // reported per tier instead of as one undifferentiated "premium".
        plan: String(row.plan || ""),
      },
    });
  } catch (err) {
    console.error("conversion route failed:", (err as Error)?.message);
    return NextResponse.json({ conversion: null });
  }
}
