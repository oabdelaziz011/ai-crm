export const dashboardSnapshotKey = (
  companyId: string,
  timeRange: string,
  filterKey: string,
) => ["dashboard", "snapshot", companyId, timeRange, filterKey] as const;

export const DASHBOARD_SNAPSHOT_STALE_MS = 60_000;
