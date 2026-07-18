import { supabase } from "@/lib/supabase";
import type { PagedCompanySubscriptions } from "@/lib/billing/types";

export type SubscriptionSortKey = "company" | "plan" | "status" | "renewal";
export type SortDirection = "asc" | "desc";

export type ListCompanySubscriptionsParams = {
  limit: number;
  offset: number;
  search?: string;
  status?: string | null;
  billingCycle?: string | null;
  sortBy?: SubscriptionSortKey;
  sortDir?: SortDirection;
};

export type ListCompanySubscriptionsResult = PagedCompanySubscriptions & {
  degraded?: boolean;
  degradedMessage?: string;
};

function normalizePayload(
  payload: PagedCompanySubscriptions,
  limit: number,
  offset: number,
  degraded = false,
  degradedMessage?: string,
): ListCompanySubscriptionsResult {
  return {
    total: Number(payload.total ?? 0),
    limit: Number(payload.limit ?? limit),
    offset: Number(payload.offset ?? offset),
    rows: payload.rows ?? [],
    stats: payload.stats ?? { total: 0, active: 0, trialing: 0, at_risk: 0 },
    degraded,
    degradedMessage,
  };
}

function isMissingExtendedRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function") ||
    lower.includes("function public.list_company_subscriptions_paged") ||
    lower.includes("does not exist") ||
    lower.includes("unknown argument") ||
    lower.includes("schema cache")
  );
}

export async function listCompanySubscriptionsPagedRpc(
  params: ListCompanySubscriptionsParams,
): Promise<ListCompanySubscriptionsResult> {
  const {
    limit,
    offset,
    search = "",
    status = null,
    billingCycle = null,
    sortBy = "renewal",
    sortDir = "desc",
  } = params;

  const extendedArgs = {
    p_limit: limit,
    p_offset: offset,
    p_search: search.trim() || null,
    p_status: status && status !== "all" ? status : null,
    p_billing_cycle: billingCycle && billingCycle !== "all" ? billingCycle : null,
    p_sort_by: sortBy,
    p_sort_dir: sortDir,
  };

  const { data, error } = await supabase.rpc("list_company_subscriptions_paged", extendedArgs);

  if (!error) {
    return normalizePayload(data as PagedCompanySubscriptions, limit, offset);
  }

  if (!isMissingExtendedRpcError(error.message)) {
    throw new Error(error.message);
  }

  const { data: legacyData, error: legacyError } = await supabase.rpc("list_company_subscriptions_paged", {
    p_limit: limit,
    p_offset: offset,
    p_search: search.trim() || null,
    p_status: status && status !== "all" ? status : null,
  });

  if (legacyError) {
    throw new Error(legacyError.message);
  }

  return normalizePayload(
    legacyData as PagedCompanySubscriptions,
    limit,
    offset,
    true,
    "Billing migration 045 is not applied. Cycle filter and server-side sorting are unavailable until the migration is deployed.",
  );
}
