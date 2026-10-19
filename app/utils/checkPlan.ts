import { supabase } from "@/lib/supabase/browser";


export async function checkPlan(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (error || !data) {
    console.error("Error fetching plan:", error);
    return "free";
  }

  return data.plan || "free";
}
