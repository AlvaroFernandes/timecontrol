import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settings } from "@/types";

export const DEFAULT_SETTINGS: Settings = {
  yourName: "", abn: "", yourAddress: "", yourPhone: "", yourEmail: "",
  tfnRate: "", defaultRate: "",
  invoicePrefix: "INV", invoiceNum: 1, invoiceDate: "", invoiceItems: [],
  companyName: "", companyAbn: "", companyAddress: "", companyEmail: "",
  bankName: "", bsb: "", accountNumber: "", invoiceNotes: "",
  tfnLimit: 30, overtimeThreshold: 12,
  pdfNamePattern: "Invoice-{num}-{company}-{date}",
};

export interface SettingsRow {
  settings: Settings;
  periodStart: string;
  periodEnd: string;
}

export async function getSettings(supabase: SupabaseClient, userId: string): Promise<SettingsRow | null> {
  const { data } = await supabase
    .from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const sd = data as { data: Settings; period_start: string; period_end: string };
  return {
    settings:    { ...DEFAULT_SETTINGS, ...(sd.data ?? {}) },
    periodStart: sd.period_start ?? "",
    periodEnd:   sd.period_end ?? "",
  };
}

export async function saveSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: Settings,
  periodStart: string,
  periodEnd: string,
): Promise<boolean> {
  const { error } = await supabase.from("settings").upsert({
    user_id: userId, data: settings,
    period_start: periodStart || null,
    period_end:   periodEnd   || null,
  });
  return !error;
}
