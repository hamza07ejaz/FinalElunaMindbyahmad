import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Used by the flashcards / test / visual-map pages to know the caller's plan.
export async function GET(req: Request) {
  const auth = await requireUser(req);
  return NextResponse.json({ plan: auth?.plan ?? "free", loggedIn: !!auth });
}
