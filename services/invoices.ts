import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedInvoice, InvLineRow, Settings } from "@/types";

export function fromInvoiceRow(row: Record<string, unknown>): SavedInvoice {
  return {
    id:          row.id as string,
    invoiceNum:  row.invoice_num as number,
    issueDate:   row.issue_date as string,
    companyName: (row.company_name as string) || "",
    subtotal:    Number(row.subtotal),
    createdAt:   row.created_at as string,
    data:        row.data as SavedInvoice["data"],
  };
}

export async function getInvoices(supabase: SupabaseClient, userId: string): Promise<SavedInvoice[]> {
  const { data } = await supabase
    .from("invoices").select("*").eq("user_id", userId)
    .order("invoice_num", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(fromInvoiceRow);
}

export interface SaveInvoiceParams {
  id: string;
  userId: string;
  invoiceNum: number;
  issueDate: string;
  companyName: string;
  subtotal: number;
  settings: Partial<Settings>;
  rows: InvLineRow[];
  periodStart: string;
  periodEnd: string;
}

export async function saveInvoice(
  supabase: SupabaseClient,
  params: SaveInvoiceParams,
): Promise<SavedInvoice | null> {
  const { data, error } = await supabase.from("invoices").insert({
    id:           params.id,
    user_id:      params.userId,
    invoice_num:  params.invoiceNum,
    issue_date:   params.issueDate,
    company_name: params.companyName,
    subtotal:     params.subtotal,
    data: {
      settings:    params.settings,
      rows:        params.rows,
      periodStart: params.periodStart,
      periodEnd:   params.periodEnd,
    },
  }).select().single();
  if (error || !data) return null;
  return fromInvoiceRow(data as Record<string, unknown>);
}

export async function deleteInvoice(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  return !error;
}
