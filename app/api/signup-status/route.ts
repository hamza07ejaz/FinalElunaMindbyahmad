import { NextResponse } from "next/server";
import { getSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";

// The login page asks this before showing the sign-up form.
export async function GET() {
  const { flags, branding } = await getSettings();
  return NextResponse.json({ signupsOpen: flags.signupsOpen, siteName: branding.siteName, supportEmail: branding.supportEmail });
}
