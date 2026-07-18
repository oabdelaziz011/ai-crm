import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BillingPayment } from "@/lib/billing/types";

export function useBillingPayments(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "payments", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<BillingPayment[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("billing_payments")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as BillingPayment[];
    },
  });
}
