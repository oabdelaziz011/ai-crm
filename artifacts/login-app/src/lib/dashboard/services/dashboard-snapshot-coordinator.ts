import type { QueryClient } from "@tanstack/react-query";
import type { DashboardAccess, DashboardRefreshSignal, DashboardSnapshot } from "@workspace/dashboard-engine";
import { dashboardSnapshotKey } from "@/lib/dashboard/cache/query-keys";
import {
  fetchDashboardSnapshot,
  refreshDashboardSnapshot,
  type DashboardSnapshotRequest,
} from "@/lib/dashboard/services/dashboard-service";
import type { DashboardTimeRange } from "@/lib/dashboard/selectors/executive-dashboard-selectors";

const PROVIDER_PERMISSIONS: Record<string, string> = {
  crm: "customers.view",
  support: "support.view",
  ai: "ai_chat.view",
  automation: "automation.view",
  knowledge: "knowledge.view",
  channels: "channels.view",
  finance: "invoices.view",
  invoices: "invoices.view",
  bookings: "bookings.view",
};

export const ALL_DASHBOARD_PROVIDER_IDS = [
  "crm",
  "support",
  "ai",
  "automation",
  "knowledge",
  "channels",
  "finance",
  "bookings",
  "invoices",
] as const;

export function resolveAllowedDashboardProviderIds(access: DashboardAccess): string[] {
  return ALL_DASHBOARD_PROVIDER_IDS.filter(
    (providerId) =>
      access.isSuperAdmin
      || access.hasPermission(PROVIDER_PERMISSIONS[providerId] ?? "dashboard.view"),
  );
}

export type DashboardSnapshotRefreshCoordinatorInput = {
  queryClient: QueryClient;
  access: DashboardAccess;
  companyId: string;
  timeRange: DashboardTimeRange;
};

export function createDashboardSnapshotRefreshCoordinator(
  input: DashboardSnapshotRefreshCoordinatorInput,
) {
  return async (signal: DashboardRefreshSignal): Promise<void> => {
    if (signal.companyId !== input.companyId) return;

    const queryKey = dashboardSnapshotKey(input.companyId, input.timeRange, "all");
    const cached = input.queryClient.getQueryData<DashboardSnapshot>(queryKey);
    const request: DashboardSnapshotRequest = {
      companyId: input.companyId,
      timeRange: input.timeRange,
      providerIds: signal.scope.providerIds,
      categories: signal.scope.categories,
    };

    const nextSnapshot = cached
      ? await refreshDashboardSnapshot(input.access, cached, request)
      : await fetchDashboardSnapshot(input.access, request);

    input.queryClient.setQueryData(queryKey, nextSnapshot);
  };
}
