import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { OperationsDataService } from "@/lib/scheduling/operations/services/operations-data-service";
import {
  operationsDayKey,
  operationsFilterSignature,
  invalidateOperationsQueries,
} from "@/lib/scheduling/operations/cache";
import type { OperationsFilters } from "@/lib/scheduling/operations/types";
import { resolveOperationsDate } from "@/lib/scheduling/operations/utilities";

const dataService = new OperationsDataService(supabase);

export function useOperationsDayData(
  companyId: string | null,
  filters: OperationsFilters,
  timezone: string,
) {
  const date = resolveOperationsDate(filters.datePreset, filters.date);
  const filterSignature = operationsFilterSignature({
    branchId: filters.branchId,
    resourceIds: filters.resourceIds,
    serviceIds: filters.serviceIds,
    statuses: filters.statuses,
    search: filters.search,
  });

  return useQuery({
    queryKey: operationsDayKey(companyId, date, filterSignature),
    enabled: Boolean(companyId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: () => dataService.loadDayData(companyId!, filters, timezone),
  });
}

export function useOperationsFilters(initial?: Partial<OperationsFilters>) {
  const [filters, setFilters] = useState<OperationsFilters>({
    datePreset: initial?.datePreset ?? "today",
    date: initial?.date ?? new Date().toISOString().slice(0, 10),
    branchId: initial?.branchId ?? null,
    resourceIds: initial?.resourceIds ?? [],
    serviceIds: initial?.serviceIds ?? [],
    statuses: initial?.statuses ?? [],
    search: initial?.search ?? "",
  });

  const updateFilters = useCallback((patch: Partial<OperationsFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  return { filters, setFilters, updateFilters };
}

export function useOperationsRealtime(companyId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`operations:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "scheduling_bookings",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          invalidateOperationsQueries(qc, { companyId });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}

export function useOperationsRefresh(
  companyId: string | null,
  filters: OperationsFilters,
  timezone: string,
) {
  const query = useOperationsDayData(companyId, filters, timezone);
  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return useMemo(
    () => ({
      refresh,
      isRefreshing: query.isFetching && !query.isLoading,
    }),
    [refresh, query.isFetching, query.isLoading],
  );
}
