export const marketplaceOverviewKey = (companyId: string) => ["marketplace", "overview", companyId] as const;
export const marketplaceCatalogKey = () => ["marketplace", "catalog"] as const;
export const marketplaceInstalledKey = (companyId: string) => ["marketplace", "installed", companyId] as const;
export const marketplaceMonitoringKey = (companyId: string) => ["marketplace", "monitoring", companyId] as const;
export const marketplaceAuditKey = (companyId: string) => ["marketplace", "audit", companyId] as const;
export const MARKETPLACE_CACHE_STALE_MS = 30_000;
