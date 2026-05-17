import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getInvoiceByToken } from "@/services/invoices";
import { PublicInvoiceView } from "@/components/PublicInvoiceView";

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase  = await createClient();
  const invoice   = await getInvoiceByToken(supabase, token);
  if (!invoice) notFound();
  return <PublicInvoiceView invoice={invoice} />;
}
