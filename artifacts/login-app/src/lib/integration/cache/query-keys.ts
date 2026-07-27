export const integrationOverviewKey = (companyId: string) => ["integration", "overview", companyId] as const;
export const integrationApiKeysKey = (companyId: string) => ["integration", "api-keys", companyId] as const;
export const integrationWebhooksKey = (companyId: string) => ["integration", "webhooks", companyId] as const;
export const integrationDeliveriesKey = (companyId: string) => ["integration", "deliveries", companyId] as const;
export const integrationMonitoringKey = (companyId: string) => ["integration", "monitoring", companyId] as const;
export const INTEGRATION_CACHE_STALE_MS = 30_000;
