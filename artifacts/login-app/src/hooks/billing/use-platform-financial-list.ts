import { useQuery } from "@tanstack/react-query";
import {
  fetchPlatformFinancialListPaged,
  type PlatformFinancialListType,
} from "@/lib/billing/platform-financial-list";

export function usePlatformFinancialListPaged(
  listType: PlatformFinancialListType,
  params: {
    enabled?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
    status?: string | null;
  } = {},
) {
  const { enabled = true, limit = 15, offset = 0, search = "", status = null } = params;

  return useQuery({
    queryKey: ["billing", "platform", listType, "v1", limit, offset, search, status],
    enabled,
    queryFn: () => fetchPlatformFinancialListPaged({ listType, limit, offset, search, status }),
  });
}

export function useBillingRevenueMetrics(enabled = true) {
  return useQuery({
    queryKey: ["billing", "platform", "revenue", "v1"],
    enabled,
    queryFn: async () => {
      const { fetchBillingRevenueMetricsV1 } = await import("@/lib/billing/platform-financial-list");
      return fetchBillingRevenueMetricsV1();
    },
  });
}

export function usePaymentProviderHealth(enabled = true) {
  return useQuery({
    queryKey: ["billing", "platform", "provider-health", "v1"],
    enabled,
    queryFn: async () => {
      const { fetchPaymentProviderHealthV1 } = await import("@/lib/billing/platform-financial-list");
      return fetchPaymentProviderHealthV1();
    },
  });
}
