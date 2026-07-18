import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BillingInvoice } from "@/lib/billing/types";

export function useBillingInvoices(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "invoices", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<BillingInvoice[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("billing_invoices")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as BillingInvoice[];
    },
  });
}
