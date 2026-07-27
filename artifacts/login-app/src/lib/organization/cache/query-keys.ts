export const organizationOverviewKey = (companyId: string) => ["organization", "overview", companyId] as const;
export const organizationAnalyticsKey = (companyId: string, date: string) => ["organization", "analytics", companyId, date] as const;
export const organizationTransfersKey = (companyId: string) => ["organization", "transfers", companyId] as const;
export const organizationSearchKey = (companyId: string, query: string) => ["organization", "search", companyId, query] as const;
export const ORGANIZATION_CACHE_STALE_MS = 30_000;
