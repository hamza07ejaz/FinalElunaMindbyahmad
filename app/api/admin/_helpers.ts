import { NextResponse } from "next/server";
import { requireStaff, type AuthResult, type Permission } from "../../../lib/auth";

/**
 * Every admin route starts here.
 *
 * Pass the permission the route needs. A sub-admin without it gets the same
 * 403 as a stranger, so a route can never be reached by someone who merely
 * happens to be staff.
 */
export async function adminOrFail(
  req: Request,
  permission?: Permission
): Promise<{ ok: true; admin: AuthResult } | { ok: false; res: NextResponse }> {
  const admin = await requireStaff(req, permission);
  if (!admin) {
    return { ok: false, res: NextResponse.json({ error: "You do not have access to this." }, { status: 403 }) };
  }
  return { ok: true, admin };
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { return {}; }
}

export const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
