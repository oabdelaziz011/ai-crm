import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BillingContact } from "@/lib/billing/types";

export function useBillingContact(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "billing-contact", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<BillingContact | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_billing_contacts")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as BillingContact | null) ?? null;
    },
  });
}
