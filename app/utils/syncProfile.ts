// Profiles are now created by a database trigger on signup (see supabase/001_foundation.sql).
// The old version overwrote every user's plan with "free" from the browser, so it is intentionally a no-op.
export async function syncProfile() {
  return;
}
