import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedUser } from "@/types";

export async function ensureProfile(supabase: SupabaseClient, userId: string, email: string | undefined): Promise<void> {
  await supabase.from("profiles").upsert(
    { user_id: userId, email },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
}

export async function getProfile(supabase: SupabaseClient, userId: string): Promise<{ role: "user" | "admin" }> {
  const { data } = await supabase
    .from("profiles").select("*").eq("user_id", userId).maybeSingle();
  const role: "user" | "admin" = (data as Record<string, unknown> | null)?.role as "user" | "admin" ?? "user";
  return { role };
}

export async function getManagedUsers(supabase: SupabaseClient, adminId: string): Promise<ManagedUser[]> {
  const { data } = await supabase
    .from("profiles").select("*").eq("admin_id", adminId);
  return ((data ?? []) as Record<string, unknown>[]).map(p => ({
    id:    p.user_id as string,
    name:  (p.name as string) || (p.email as string) || "Unknown",
    email: (p.email as string) || "",
  }));
}
