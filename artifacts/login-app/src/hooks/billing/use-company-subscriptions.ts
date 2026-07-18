import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  listCompanySubscriptionsPagedRpc,
  type SortDirection,
  type SubscriptionSortKey,
} from "@/lib/billing/list-company-subscriptions-rpc";
import type { CompanySubscription, PagedCompanySubscriptions } from "@/lib/billing/types";

export const COMPANY_SUBSCRIPTIONS_KEY = ["billing", "company-subscriptions"] as const;

export type { BillingSubscriptionStats, PagedCompanySubscriptions } from "@/lib/billing/types";
export type { SortDirection, SubscriptionSortKey } from "@/lib/billing/list-company-subscriptions-rpc";

export function useCompanySubscriptionsPaged(
  params: {
    enabled?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
    status?: string | null;
    billingCycle?: string | null;
    sortBy?: SubscriptionSortKey;
    sortDir?: SortDirection;
  } = {},
) {
  const {
    enabled = true,
    limit = 20,
    offset = 0,
    search = "",
    status = null,
    billingCycle = null,
    sortBy = "renewal",
    sortDir = "desc",
  } = params;

  return useQuery({
    queryKey: [...COMPANY_SUBSCRIPTIONS_KEY, "paged", limit, offset, search, status, billingCycle, sortBy, sortDir],
    enabled,
    queryFn: async (): Promise<PagedCompanySubscriptions> => {
      return listCompanySubscriptionsPagedRpc({
        limit,
        offset,
        search,
        status,
        billingCycle,
        sortBy,
        sortDir,
      });
    },
  });
}

export function useCompanySubscription(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: [...COMPANY_SUBSCRIPTIONS_KEY, companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: async (): Promise<CompanySubscription | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_subscriptions")
        .select(
          `
          *,
          company:companies(id, name, logo_url, company_type, status, created_at),
          plan:plans(
            id, name, display_name, code, tier_rank,
            price_monthly, price_yearly,
            max_users, max_customers, storage_gb, ai_tokens_monthly, features
          )
        `,
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CompanySubscription | null) ?? null;
    },
  });
}
