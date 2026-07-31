import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_VIEW_PERMISSION, type DashboardAccess } from "@workspace/dashboard-engine";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  DASHBOARD_SNAPSHOT_STALE_MS,
  dashboardSnapshotKey,
} from "@/lib/dashboard/cache/query-keys";
import {
  buildExecutiveDashboardViewModel,
  type DashboardTimeRange,
} from "@/lib/dashboard/selectors/executive-dashboard-selectors";
import { fetchDashboardSnapshot } from "@/lib/dashboard/services/dashboard-service";
import { useDashboardRealtime } from "@/lib/dashboard/hooks/use-dashboard-realtime";

export function useDashboardAccess(): DashboardAccess | null {
  const { user, profile } = useAuth();
  const { hasPermission, isSuperAdmin } = useAuthUser();

  return useMemo(() => {
    if (!user?.id || !profile?.company_id) return null;
    return {
      userId: user.id,
      companyId: profile.company_id,
      isSuperAdmin,
      hasPermission: (code: string) => isSuperAdmin || hasPermission(code),
    };
  }, [user?.id, profile?.company_id, isSuperAdmin, hasPermission]);
}

export function useDashboardSnapshot(timeRange: DashboardTimeRange = "30d") {
  const access = useDashboardAccess();
  const companyId = access?.companyId ?? null;
  const canView =
    access?.isSuperAdmin
    || access?.hasPermission(DASHBOARD_VIEW_PERMISSION)
    || access?.hasPermission("executive.view")
    || access?.hasPermission("reports.view");

  const query = useQuery({
    queryKey: dashboardSnapshotKey(companyId ?? "", timeRange, "all"),
    enabled: Boolean(access && companyId && canView),
    staleTime: DASHBOARD_SNAPSHOT_STALE_MS,
    queryFn: () =>
      fetchDashboardSnapshot(access!, {
        companyId: companyId!,
        timeRange,
      }),
  });

  const viewModel = useMemo(
    () =>
      buildExecutiveDashboardViewModel(query.data, {
        loading: query.isLoading,
      }),
    [query.data, query.isLoading],
  );

  useDashboardRealtime(companyId, timeRange, Boolean(access && companyId && canView));

  return {
    ...query,
    access,
    canView,
    companyId,
    viewModel,
    snapshot: query.data,
  };
}

export function useRefreshDashboardSnapshot() {
  const queryClient = useQueryClient();
  return (companyId: string, timeRange: DashboardTimeRange) =>
    queryClient.invalidateQueries({ queryKey: dashboardSnapshotKey(companyId, timeRange, "all") });
}

export type { DashboardTimeRange };
