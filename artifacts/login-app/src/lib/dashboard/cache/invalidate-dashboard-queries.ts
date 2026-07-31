import type { QueryClient } from "@tanstack/react-query";
import { dashboardSnapshotKey } from "@/lib/dashboard/cache/query-keys";

export type InvalidateDashboardQueriesInput = {
  companyId: string;
  timeRange?: string;
};

export function invalidateDashboardQueries(
  queryClient: QueryClient,
  input: InvalidateDashboardQueriesInput,
): void {
  if (input.timeRange) {
    void queryClient.invalidateQueries({
      queryKey: dashboardSnapshotKey(input.companyId, input.timeRange, "all"),
    });
    return;
  }

  void queryClient.invalidateQueries({
    queryKey: ["dashboard", "snapshot", input.companyId],
  });
}

export function dashboardSnapshotQueryPrefix(companyId: string) {
  return ["dashboard", "snapshot", companyId] as const;
}
