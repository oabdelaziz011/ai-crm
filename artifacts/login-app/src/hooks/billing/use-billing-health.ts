import { useQuery } from "@tanstack/react-query";
import { runBillingHealthCheck, type BillingHealthResult } from "@/lib/billing/billing-health";
import { supabase } from "@/lib/supabase";

export const BILLING_HEALTH_KEY = ["billing", "health"] as const;

export function useBillingHealth(enabled = true) {
  return useQuery({
    queryKey: BILLING_HEALTH_KEY,
    enabled,
    staleTime: 60_000,
    queryFn: () => runBillingHealthCheck(supabase),
    select: (data: BillingHealthResult) => data,
  });
}
