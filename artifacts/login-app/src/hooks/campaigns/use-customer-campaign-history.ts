import { useCallback, useEffect, useState } from "react";
import { useCompanyPermissionAuth } from "@/hooks/billing/use-company-permission-auth";
import { MarketingCampaignRepository } from "@/lib/campaigns";
import type {
  CustomerCampaignHistoryItem,
  CustomerCampaignHistoryQuery,
  CustomerCampaignHistoryResult,
  CustomerCampaignHistoryStatusFilter,
  CustomerCampaignHistoryPeriod,
} from "@/lib/campaigns/customer-campaign-history";
import { CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE } from "@/lib/campaigns/customer-campaign-history";
import type { MarketingCampaignChannel } from "@/lib/campaigns/types";
import { supabase } from "@/lib/supabase";

export type UseCustomerCampaignHistoryParams = {
  companyId: string | null | undefined;
  customerId: string | null | undefined;
  page?: number;
  pageSize?: number;
  status?: CustomerCampaignHistoryStatusFilter;
  channel?: MarketingCampaignChannel | "all";
  period?: CustomerCampaignHistoryPeriod;
  dateFrom?: string | null;
  dateTo?: string | null;
  enabled?: boolean;
};

export function useCustomerCampaignHistory(params: UseCustomerCampaignHistoryParams) {
  const { hasCompanyPermission } = useCompanyPermissionAuth();
  const canView = hasCompanyPermission("campaigns.view");
  const enabled = params.enabled !== false && Boolean(params.companyId && params.customerId);
  const [data, setData] = useState<CustomerCampaignHistoryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || !params.companyId || !params.customerId || !canView) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const repo = new MarketingCampaignRepository(supabase);
      const query: CustomerCampaignHistoryQuery = {
        companyId: params.companyId,
        customerId: params.customerId,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE,
        status: params.status ?? "all",
        channel: params.channel ?? "all",
        period: params.period ?? "all",
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      };
      const result = await repo.listCustomerCampaignHistory(query);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    enabled,
    canView,
    params.companyId,
    params.customerId,
    params.page,
    params.pageSize,
    params.status,
    params.channel,
    params.period,
    params.dateFrom,
    params.dateTo,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    canView,
    data,
    items: (data?.items ?? []) as CustomerCampaignHistoryItem[],
    summary: data?.summary ?? null,
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? CUSTOMER_CAMPAIGN_HISTORY_PAGE_SIZE,
    isLoading,
    error,
    refetch: load,
  };
}
