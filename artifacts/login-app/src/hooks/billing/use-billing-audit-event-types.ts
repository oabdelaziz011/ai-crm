import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BillingAuditEventType } from "@/lib/billing/types";

export function useBillingAuditEventTypes(enabled = true) {
  return useQuery({
    queryKey: ["billing", "audit-event-types"],
    enabled,
    queryFn: async (): Promise<BillingAuditEventType[]> => {
      const { data, error } = await supabase
        .from("billing_audit_event_types")
        .select("code, label, description")
        .eq("is_active", true)
        .order("code");
      if (error) throw new Error(error.message);
      return (data ?? []) as BillingAuditEventType[];
    },
  });
}
