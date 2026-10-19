"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase/browser";

export function NavAuth() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (alive) setLoggedIn(!!data.user); })
      .catch(() => { /* logged out is the safe assumption */ });
    return () => { alive = false; };
  }, []);
  return loggedIn ? (
    <Link href="/dashboard" className="btn btn-primary btn-sm">Open dashboard</Link>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/login" className="btn btn-ghost btn-sm">Log in</Link>
      <Link href="/login?mode=signup&next=/dashboard" className="btn btn-primary btn-sm">Start free</Link>
    </div>
  );
}
