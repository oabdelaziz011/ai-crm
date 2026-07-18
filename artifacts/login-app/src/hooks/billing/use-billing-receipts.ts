import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BillingReceipt } from "@/lib/billing/types";

export function useBillingReceipts(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "receipts", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<BillingReceipt[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("billing_receipts")
        .select("*")
        .eq("company_id", companyId)
        .order("issued_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as BillingReceipt[];
    },
  });
}
