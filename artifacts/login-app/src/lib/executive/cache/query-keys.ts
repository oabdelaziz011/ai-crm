export const executiveDashboardKey = (companyId: string, branchId?: string | null, date?: string) =>
  ["executive", "dashboard", companyId, branchId ?? "all", date ?? "today"] as const;

export const executiveAlertsKey = (companyId: string) => ["executive", "alerts", companyId] as const;

export const EXECUTIVE_CACHE_STALE_MS = 30_000;
