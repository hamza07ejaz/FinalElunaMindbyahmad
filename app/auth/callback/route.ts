import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase/server";

// Handles the redirect back from Google sign-in and from email confirmation links.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let next = url.searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/dashboard";

  if (code) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const target = new URL(next, url.origin);

      /*
       * Tell the page whether this was a first sign-in or a returning one.
       *
       * Google hands back the same thing either way, and the browser cannot
       * tell them apart — the OAuth button looks identical whether it creates
       * an account or opens an existing one. The server can: a user created
       * moments ago is a registration. Getting this wrong would quietly count
       * every returning student as a new signup, which is the number the ad
       * spend is judged on.
       *
       * It travels as a query parameter rather than a cookie because the page
       * that reads it removes it immediately, and a value that lingers is a
       * value that fires twice.
       */
      const createdAt = data.user?.created_at ? Date.parse(data.user.created_at) : NaN;
      const isNew = Number.isFinite(createdAt) && Date.now() - createdAt < 120_000;
      target.searchParams.set("auth", isNew ? "signup" : "login");

      return NextResponse.redirect(target);
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
