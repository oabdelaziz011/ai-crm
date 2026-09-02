import { useCallback, useEffect, useState } from "react";
import { useHasPermission } from "@/hooks/use-rbac";
import {
  CUSTOMER_AUDIT_HISTORY_PAGE_SIZE,
  type CustomerAuditEventFilter,
  type CustomerAuditHistoryPeriod,
  type CustomerAuditHistoryResult,
  type CustomerAuditSourceFilter,
} from "@/lib/customer-workspace/customer-audit-history";
import { CustomerAuditHistoryRepository } from "@/lib/customer-workspace/customer-audit-history-repository";
import type { CustomerAuditModuleAccess } from "@/lib/customer-workspace/workspace-feature-access";
import { supabase } from "@/lib/supabase";

export type UseCustomerAuditHistoryParams = {
  companyId: string | null | undefined;
  customerId: string | null | undefined;
  page?: number;
  pageSize?: number;
  period?: CustomerAuditHistoryPeriod;
  eventFilter?: CustomerAuditEventFilter;
  sourceFilter?: CustomerAuditSourceFilter;
  actorUserId?: string | null;
  moduleAccess?: CustomerAuditModuleAccess;
  enabled?: boolean;
};

export function useCustomerAuditHistory(params: UseCustomerAuditHistoryParams) {
  const canView = useHasPermission("audit_logs.view");
  const enabled =
    params.enabled !== false && Boolean(params.companyId && params.customerId);
  const [data, setData] = useState<CustomerAuditHistoryResult | null>(null);
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
      const repo = new CustomerAuditHistoryRepository(supabase);
      const result = await repo.list({
        companyId: params.companyId,
        customerId: params.customerId,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? CUSTOMER_AUDIT_HISTORY_PAGE_SIZE,
        period: params.period ?? "all",
        eventFilter: params.eventFilter ?? "all",
        sourceFilter: params.sourceFilter ?? "all",
        actorUserId: params.actorUserId ?? null,
        moduleAccess: params.moduleAccess,
      });
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
    params.period,
    params.eventFilter,
    params.sourceFilter,
    params.actorUserId,
    params.moduleAccess,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    canView,
    data,
    items: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? params.page ?? 1,
    pageSize: data?.pageSize ?? params.pageSize ?? CUSTOMER_AUDIT_HISTORY_PAGE_SIZE,
    isLoading,
    error,
    reload: load,
  };
}
