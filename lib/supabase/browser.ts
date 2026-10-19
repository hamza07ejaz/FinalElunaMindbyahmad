// Use this in ALL client components. createBrowserClient stores the session in cookies,
// so server API routes can identify the logged-in user without extra headers.
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
