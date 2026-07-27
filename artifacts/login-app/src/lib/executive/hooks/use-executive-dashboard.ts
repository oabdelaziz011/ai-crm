import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildExecutiveDashboard, getExecutivePlatformServices } from "@/lib/executive/services/executive-platform-service";
import { executiveAlertsKey, executiveDashboardKey, EXECUTIVE_CACHE_STALE_MS } from "@/lib/executive/cache/query-keys";
import type { ExecutiveContext, ExecutiveReportRequest } from "@/lib/executive/types";

export function useExecutiveDashboard(context: ExecutiveContext | null) {
  return useQuery({
    queryKey: executiveDashboardKey(context?.companyId ?? "", context?.branchId, context?.date),
    enabled: Boolean(context?.companyId),
    staleTime: EXECUTIVE_CACHE_STALE_MS,
    refetchInterval: EXECUTIVE_CACHE_STALE_MS,
    queryFn: () => buildExecutiveDashboard(context!),
  });
}

export function useExecutiveAlerts(companyId: string | null) {
  return useQuery({
    queryKey: executiveAlertsKey(companyId ?? ""),
    enabled: Boolean(companyId),
    staleTime: EXECUTIVE_CACHE_STALE_MS,
    queryFn: () => getExecutivePlatformServices().alerts.listActive(companyId!),
  });
}

export function useDismissExecutiveAlert(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, actorId }: { alertId: string; actorId: string }) =>
      getExecutivePlatformServices().alerts.dismiss(companyId!, alertId, actorId),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: executiveAlertsKey(companyId) });
    },
  });
}

export function useResolveExecutiveAlert(companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, actorId }: { alertId: string; actorId: string }) =>
      getExecutivePlatformServices().alerts.resolve(companyId!, alertId, actorId),
    onSuccess: () => {
      if (companyId) void qc.invalidateQueries({ queryKey: executiveAlertsKey(companyId) });
    },
  });
}

export function useExecutiveReport(context: ExecutiveContext | null, request: ExecutiveReportRequest | null) {
  return useQuery({
    queryKey: ["executive", "report", context?.companyId, request?.kind, request?.period],
    enabled: Boolean(context?.companyId && request),
    queryFn: async () => {
      const snapshot = await buildExecutiveDashboard(context!);
      return getExecutivePlatformServices().reports.generate(request!, snapshot);
    },
  });
}
